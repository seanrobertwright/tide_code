use serde::Serialize;
use tree_sitter::Node;

#[derive(Debug, Clone, Serialize)]
pub enum SymbolKind {
    Function,
    Class,
    Method,
    Constant,
    Interface,
    Type,
    Enum,
    Struct,
    Trait,
    Impl,
    Module,
}

impl SymbolKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            SymbolKind::Function => "function",
            SymbolKind::Class => "class",
            SymbolKind::Method => "method",
            SymbolKind::Constant => "constant",
            SymbolKind::Interface => "interface",
            SymbolKind::Type => "type",
            SymbolKind::Enum => "enum",
            SymbolKind::Struct => "struct",
            SymbolKind::Trait => "trait",
            SymbolKind::Impl => "impl",
            SymbolKind::Module => "module",
        }
    }
}

#[derive(Debug, Clone)]
pub struct RawSymbol {
    pub name: String,
    pub qualified_name: String,
    pub kind: SymbolKind,
    pub start_line: u32,
    pub end_line: u32,
    pub start_col: u32,
    pub end_col: u32,
    pub signature: Option<String>,
    pub docstring: Option<String>,
    pub parent: Option<String>,
    pub visibility: Option<String>,
    pub is_exported: bool,
}

fn node_text<'a>(node: &Node, source: &'a [u8]) -> &'a str {
    node.utf8_text(source).unwrap_or("")
}

fn extract_signature(node: &Node, source: &[u8]) -> Option<String> {
    let text = node_text(node, source);
    // Take text up to the first '{' or the end of the first line
    let sig = if let Some(brace_pos) = text.find('{') {
        text[..brace_pos].trim()
    } else {
        text.lines().next().unwrap_or("").trim()
    };
    if sig.is_empty() {
        None
    } else {
        Some(sig.to_string())
    }
}

fn find_name_child<'a>(node: &'a Node, source: &'a [u8]) -> Option<String> {
    for i in 0..node.child_count() {
        if let Some(child) = node.child(i) {
            let kind = child.kind();
            if kind == "identifier"
                || kind == "type_identifier"
                || kind == "property_identifier"
                || kind == "name"
            {
                return Some(node_text(&child, source).to_string());
            }
        }
    }
    None
}

fn preceding_docstring(node: &Node, source: &[u8]) -> Option<String> {
    let prev = node.prev_sibling();
    while let Some(p) = prev {
        match p.kind() {
            "comment" | "line_comment" | "block_comment" => {
                let text = node_text(&p, source).to_string();
                // Check if it's a doc comment
                if text.starts_with("///") || text.starts_with("/**") || text.starts_with("##") {
                    return Some(text);
                }
                return None;
            }
            _ => return None,
        }
    }
    None
}

pub fn extract_symbols_typescript(root: Node, source: &[u8]) -> Vec<RawSymbol> {
    let mut symbols = Vec::new();
    extract_ts_recursive(&root, source, &mut symbols, None, false);
    symbols
}

fn extract_ts_recursive(
    node: &Node,
    source: &[u8],
    symbols: &mut Vec<RawSymbol>,
    parent_name: Option<&str>,
    in_export: bool,
) {
    let kind = node.kind();

    match kind {
        "function_declaration" => {
            if let Some(name) = find_name_child(node, source) {
                let qualified = match parent_name {
                    Some(p) => format!("{}.{}", p, name),
                    None => name.clone(),
                };
                symbols.push(RawSymbol {
                    name: name.clone(),
                    qualified_name: qualified,
                    kind: SymbolKind::Function,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: None,
                    is_exported: in_export,
                });
            }
        }
        "class_declaration" => {
            if let Some(name) = find_name_child(node, source) {
                let qualified = match parent_name {
                    Some(p) => format!("{}.{}", p, name),
                    None => name.clone(),
                };
                symbols.push(RawSymbol {
                    name: name.clone(),
                    qualified_name: qualified.clone(),
                    kind: SymbolKind::Class,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: None,
                    is_exported: in_export,
                });
                // Recurse into class body for methods
                if let Some(body) = node.child_by_field_name("body") {
                    for i in 0..body.child_count() {
                        if let Some(child) = body.child(i) {
                            extract_ts_recursive(&child, source, symbols, Some(&qualified), false);
                        }
                    }
                }
                return; // Don't recurse again below
            }
        }
        "method_definition" | "public_field_definition" => {
            if let Some(name) = find_name_child(node, source) {
                let qualified = match parent_name {
                    Some(p) => format!("{}.{}", p, name),
                    None => name.clone(),
                };
                symbols.push(RawSymbol {
                    name,
                    qualified_name: qualified,
                    kind: SymbolKind::Method,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: None,
                    is_exported: false,
                });
            }
        }
        "interface_declaration" => {
            if let Some(name) = find_name_child(node, source) {
                let qualified = match parent_name {
                    Some(p) => format!("{}.{}", p, name),
                    None => name.clone(),
                };
                symbols.push(RawSymbol {
                    name,
                    qualified_name: qualified,
                    kind: SymbolKind::Interface,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: None,
                    is_exported: in_export,
                });
            }
        }
        "type_alias_declaration" => {
            if let Some(name) = find_name_child(node, source) {
                let qualified = match parent_name {
                    Some(p) => format!("{}.{}", p, name),
                    None => name.clone(),
                };
                symbols.push(RawSymbol {
                    name,
                    qualified_name: qualified,
                    kind: SymbolKind::Type,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: None,
                    is_exported: in_export,
                });
            }
        }
        "enum_declaration" => {
            if let Some(name) = find_name_child(node, source) {
                let qualified = match parent_name {
                    Some(p) => format!("{}.{}", p, name),
                    None => name.clone(),
                };
                symbols.push(RawSymbol {
                    name,
                    qualified_name: qualified,
                    kind: SymbolKind::Enum,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: None,
                    is_exported: in_export,
                });
            }
        }
        "export_statement" => {
            // Recurse into exported declarations
            for i in 0..node.child_count() {
                if let Some(child) = node.child(i) {
                    extract_ts_recursive(&child, source, symbols, parent_name, true);
                }
            }
            return;
        }
        "lexical_declaration" => {
            // const Foo = ... (arrow functions or constants)
            for i in 0..node.child_count() {
                if let Some(child) = node.child(i) {
                    if child.kind() == "variable_declarator" {
                        if let Some(name_node) = child.child_by_field_name("name") {
                            let name = node_text(&name_node, source).to_string();
                            // Check if value is an arrow function
                            let is_arrow = child
                                .child_by_field_name("value")
                                .map(|v| v.kind() == "arrow_function")
                                .unwrap_or(false);
                            let sym_kind = if is_arrow {
                                SymbolKind::Function
                            } else {
                                SymbolKind::Constant
                            };
                            let qualified = match parent_name {
                                Some(p) => format!("{}.{}", p, name),
                                None => name.clone(),
                            };
                            symbols.push(RawSymbol {
                                name,
                                qualified_name: qualified,
                                kind: sym_kind,
                                start_line: child.start_position().row as u32 + 1,
                                end_line: child.end_position().row as u32 + 1,
                                start_col: child.start_position().column as u32,
                                end_col: child.end_position().column as u32,
                                signature: extract_signature(&child, source),
                                docstring: preceding_docstring(node, source),
                                parent: parent_name.map(|s| s.to_string()),
                                visibility: None,
                                is_exported: in_export,
                            });
                        }
                    }
                }
            }
            return;
        }
        _ => {}
    }

    // Recurse into children
    for i in 0..node.child_count() {
        if let Some(child) = node.child(i) {
            extract_ts_recursive(&child, source, symbols, parent_name, in_export);
        }
    }
}

pub fn extract_symbols_rust(root: Node, source: &[u8]) -> Vec<RawSymbol> {
    let mut symbols = Vec::new();
    extract_rust_recursive(&root, source, &mut symbols, None);
    symbols
}

fn is_pub(node: &Node, source: &[u8]) -> bool {
    for i in 0..node.child_count() {
        if let Some(child) = node.child(i) {
            if child.kind() == "visibility_modifier" {
                return node_text(&child, source).starts_with("pub");
            }
        }
    }
    false
}

fn extract_rust_recursive(
    node: &Node,
    source: &[u8],
    symbols: &mut Vec<RawSymbol>,
    parent_name: Option<&str>,
) {
    let kind = node.kind();

    match kind {
        "function_item" => {
            if let Some(name) = find_name_child(node, source) {
                let qualified = match parent_name {
                    Some(p) => format!("{}.{}", p, name),
                    None => name.clone(),
                };
                let vis = if is_pub(node, source) {
                    Some("public".to_string())
                } else {
                    None
                };
                symbols.push(RawSymbol {
                    name,
                    qualified_name: qualified,
                    kind: if parent_name.is_some() {
                        SymbolKind::Method
                    } else {
                        SymbolKind::Function
                    },
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: vis,
                    is_exported: is_pub(node, source),
                });
            }
        }
        "struct_item" => {
            if let Some(name) = find_name_child(node, source) {
                symbols.push(RawSymbol {
                    name: name.clone(),
                    qualified_name: name,
                    kind: SymbolKind::Struct,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: if is_pub(node, source) {
                        Some("public".to_string())
                    } else {
                        None
                    },
                    is_exported: is_pub(node, source),
                });
            }
        }
        "enum_item" => {
            if let Some(name) = find_name_child(node, source) {
                symbols.push(RawSymbol {
                    name: name.clone(),
                    qualified_name: name,
                    kind: SymbolKind::Enum,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: if is_pub(node, source) {
                        Some("public".to_string())
                    } else {
                        None
                    },
                    is_exported: is_pub(node, source),
                });
            }
        }
        "trait_item" => {
            if let Some(name) = find_name_child(node, source) {
                symbols.push(RawSymbol {
                    name: name.clone(),
                    qualified_name: name.clone(),
                    kind: SymbolKind::Trait,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: if is_pub(node, source) {
                        Some("public".to_string())
                    } else {
                        None
                    },
                    is_exported: is_pub(node, source),
                });
            }
        }
        "impl_item" => {
            // Extract the type name for impl blocks
            let impl_name = node
                .child_by_field_name("type")
                .map(|t| node_text(&t, source).to_string())
                .unwrap_or_else(|| "unknown".to_string());

            symbols.push(RawSymbol {
                name: impl_name.clone(),
                qualified_name: format!("impl {}", impl_name),
                kind: SymbolKind::Impl,
                start_line: node.start_position().row as u32 + 1,
                end_line: node.end_position().row as u32 + 1,
                start_col: node.start_position().column as u32,
                end_col: node.end_position().column as u32,
                signature: extract_signature(node, source),
                docstring: None,
                parent: parent_name.map(|s| s.to_string()),
                visibility: None,
                is_exported: false,
            });

            // Recurse into impl body for methods
            if let Some(body) = node.child_by_field_name("body") {
                for i in 0..body.child_count() {
                    if let Some(child) = body.child(i) {
                        extract_rust_recursive(&child, source, symbols, Some(&impl_name));
                    }
                }
            }
            return;
        }
        "const_item" => {
            if let Some(name) = find_name_child(node, source) {
                symbols.push(RawSymbol {
                    name: name.clone(),
                    qualified_name: name,
                    kind: SymbolKind::Constant,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: if is_pub(node, source) {
                        Some("public".to_string())
                    } else {
                        None
                    },
                    is_exported: is_pub(node, source),
                });
            }
        }
        "type_item" => {
            if let Some(name) = find_name_child(node, source) {
                symbols.push(RawSymbol {
                    name: name.clone(),
                    qualified_name: name,
                    kind: SymbolKind::Type,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: if is_pub(node, source) {
                        Some("public".to_string())
                    } else {
                        None
                    },
                    is_exported: is_pub(node, source),
                });
            }
        }
        "mod_item" => {
            if let Some(name) = find_name_child(node, source) {
                symbols.push(RawSymbol {
                    name: name.clone(),
                    qualified_name: name.clone(),
                    kind: SymbolKind::Module,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: if is_pub(node, source) {
                        Some("public".to_string())
                    } else {
                        None
                    },
                    is_exported: is_pub(node, source),
                });
            }
        }
        _ => {}
    }

    // Recurse into children
    for i in 0..node.child_count() {
        if let Some(child) = node.child(i) {
            extract_rust_recursive(&child, source, symbols, parent_name);
        }
    }
}

pub fn extract_symbols_python(root: Node, source: &[u8]) -> Vec<RawSymbol> {
    let mut symbols = Vec::new();
    extract_python_recursive(&root, source, &mut symbols, None);
    symbols
}

fn python_docstring(node: &Node, source: &[u8]) -> Option<String> {
    // Python docstrings are the first expression_statement containing a string in the body
    if let Some(body) = node.child_by_field_name("body") {
        if let Some(first) = body.child(0) {
            if first.kind() == "expression_statement" {
                if let Some(str_node) = first.child(0) {
                    if str_node.kind() == "string" || str_node.kind() == "concatenated_string" {
                        return Some(node_text(&str_node, source).to_string());
                    }
                }
            }
        }
    }
    None
}

fn extract_python_recursive(
    node: &Node,
    source: &[u8],
    symbols: &mut Vec<RawSymbol>,
    parent_name: Option<&str>,
) {
    let kind = node.kind();

    match kind {
        "function_definition" => {
            if let Some(name) = find_name_child(node, source) {
                let qualified = match parent_name {
                    Some(p) => format!("{}.{}", p, name),
                    None => name.clone(),
                };
                let sym_kind = if parent_name.is_some() {
                    SymbolKind::Method
                } else {
                    SymbolKind::Function
                };
                symbols.push(RawSymbol {
                    name,
                    qualified_name: qualified,
                    kind: sym_kind,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: python_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: None,
                    is_exported: !node
                        .child_by_field_name("name")
                        .map(|n| node_text(&n, source).starts_with('_'))
                        .unwrap_or(false),
                });
            }
        }
        "class_definition" => {
            if let Some(name) = find_name_child(node, source) {
                let qualified = match parent_name {
                    Some(p) => format!("{}.{}", p, name),
                    None => name.clone(),
                };
                symbols.push(RawSymbol {
                    name: name.clone(),
                    qualified_name: qualified.clone(),
                    kind: SymbolKind::Class,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: python_docstring(node, source),
                    parent: parent_name.map(|s| s.to_string()),
                    visibility: None,
                    is_exported: !name.starts_with('_'),
                });
                // Recurse into class body
                if let Some(body) = node.child_by_field_name("body") {
                    for i in 0..body.child_count() {
                        if let Some(child) = body.child(i) {
                            extract_python_recursive(&child, source, symbols, Some(&qualified));
                        }
                    }
                }
                return;
            }
        }
        "decorated_definition" => {
            // Recurse into the actual definition
            for i in 0..node.child_count() {
                if let Some(child) = node.child(i) {
                    if child.kind() == "function_definition" || child.kind() == "class_definition" {
                        extract_python_recursive(&child, source, symbols, parent_name);
                    }
                }
            }
            return;
        }
        _ => {}
    }

    for i in 0..node.child_count() {
        if let Some(child) = node.child(i) {
            extract_python_recursive(&child, source, symbols, parent_name);
        }
    }
}

pub fn extract_symbols_go(root: Node, source: &[u8]) -> Vec<RawSymbol> {
    let mut symbols = Vec::new();
    extract_go_recursive(&root, source, &mut symbols);
    symbols
}

fn extract_go_recursive(node: &Node, source: &[u8], symbols: &mut Vec<RawSymbol>) {
    let kind = node.kind();

    match kind {
        "function_declaration" => {
            if let Some(name) = find_name_child(node, source) {
                let is_exported = name.chars().next().map(|c| c.is_uppercase()).unwrap_or(false);
                symbols.push(RawSymbol {
                    name: name.clone(),
                    qualified_name: name,
                    kind: SymbolKind::Function,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: None,
                    visibility: if is_exported {
                        Some("public".to_string())
                    } else {
                        None
                    },
                    is_exported,
                });
            }
        }
        "method_declaration" => {
            if let Some(name) = find_name_child(node, source) {
                // Try to get receiver type
                let receiver = node
                    .child_by_field_name("receiver")
                    .and_then(|r| {
                        // receiver is a parameter_list; find the type inside
                        for i in 0..r.child_count() {
                            if let Some(param) = r.child(i) {
                                if param.kind() == "parameter_declaration" {
                                    if let Some(t) = param.child_by_field_name("type") {
                                        return Some(node_text(&t, source).to_string());
                                    }
                                }
                            }
                        }
                        None
                    })
                    .unwrap_or_default();
                let clean_receiver = receiver.trim_start_matches('*');
                let qualified = if clean_receiver.is_empty() {
                    name.clone()
                } else {
                    format!("{}.{}", clean_receiver, name)
                };
                let is_exported = name.chars().next().map(|c| c.is_uppercase()).unwrap_or(false);
                symbols.push(RawSymbol {
                    name,
                    qualified_name: qualified,
                    kind: SymbolKind::Method,
                    start_line: node.start_position().row as u32 + 1,
                    end_line: node.end_position().row as u32 + 1,
                    start_col: node.start_position().column as u32,
                    end_col: node.end_position().column as u32,
                    signature: extract_signature(node, source),
                    docstring: preceding_docstring(node, source),
                    parent: if clean_receiver.is_empty() {
                        None
                    } else {
                        Some(clean_receiver.to_string())
                    },
                    visibility: if is_exported {
                        Some("public".to_string())
                    } else {
                        None
                    },
                    is_exported,
                });
            }
        }
        "type_declaration" => {
            // type_declaration contains type_spec children
            for i in 0..node.child_count() {
                if let Some(spec) = node.child(i) {
                    if spec.kind() == "type_spec" {
                        if let Some(name) = find_name_child(&spec, source) {
                            let type_kind = spec
                                .child_by_field_name("type")
                                .map(|t| t.kind())
                                .unwrap_or("");
                            let sym_kind = match type_kind {
                                "struct_type" => SymbolKind::Struct,
                                "interface_type" => SymbolKind::Interface,
                                _ => SymbolKind::Type,
                            };
                            let is_exported =
                                name.chars().next().map(|c| c.is_uppercase()).unwrap_or(false);
                            symbols.push(RawSymbol {
                                name: name.clone(),
                                qualified_name: name,
                                kind: sym_kind,
                                start_line: spec.start_position().row as u32 + 1,
                                end_line: spec.end_position().row as u32 + 1,
                                start_col: spec.start_position().column as u32,
                                end_col: spec.end_position().column as u32,
                                signature: extract_signature(&spec, source),
                                docstring: preceding_docstring(node, source),
                                parent: None,
                                visibility: if is_exported {
                                    Some("public".to_string())
                                } else {
                                    None
                                },
                                is_exported,
                            });
                        }
                    }
                }
            }
        }
        "const_declaration" => {
            // const_declaration contains const_spec children
            for i in 0..node.child_count() {
                if let Some(spec) = node.child(i) {
                    if spec.kind() == "const_spec" {
                        if let Some(name) = find_name_child(&spec, source) {
                            let is_exported =
                                name.chars().next().map(|c| c.is_uppercase()).unwrap_or(false);
                            symbols.push(RawSymbol {
                                name: name.clone(),
                                qualified_name: name,
                                kind: SymbolKind::Constant,
                                start_line: spec.start_position().row as u32 + 1,
                                end_line: spec.end_position().row as u32 + 1,
                                start_col: spec.start_position().column as u32,
                                end_col: spec.end_position().column as u32,
                                signature: extract_signature(&spec, source),
                                docstring: preceding_docstring(node, source),
                                parent: None,
                                visibility: if is_exported {
                                    Some("public".to_string())
                                } else {
                                    None
                                },
                                is_exported,
                            });
                        }
                    }
                }
            }
        }
        _ => {}
    }

    for i in 0..node.child_count() {
        if let Some(child) = node.child(i) {
            extract_go_recursive(&child, source, symbols);
        }
    }
}
