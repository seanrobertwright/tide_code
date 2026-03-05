use crate::indexer::symbols::{
    self, RawSymbol,
};
use tree_sitter::{Language, Parser};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SupportedLanguage {
    TypeScript,
    Tsx,
    JavaScript,
    Jsx,
    Rust,
    Python,
    Go,
}

impl SupportedLanguage {
    pub fn as_str(&self) -> &'static str {
        match self {
            SupportedLanguage::TypeScript => "typescript",
            SupportedLanguage::Tsx => "tsx",
            SupportedLanguage::JavaScript => "javascript",
            SupportedLanguage::Jsx => "jsx",
            SupportedLanguage::Rust => "rust",
            SupportedLanguage::Python => "python",
            SupportedLanguage::Go => "go",
        }
    }

    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext {
            "ts" => Some(SupportedLanguage::TypeScript),
            "tsx" => Some(SupportedLanguage::Tsx),
            "js" => Some(SupportedLanguage::JavaScript),
            "jsx" => Some(SupportedLanguage::Jsx),
            "rs" => Some(SupportedLanguage::Rust),
            "py" => Some(SupportedLanguage::Python),
            "go" => Some(SupportedLanguage::Go),
        _ => None,
        }
    }

    pub fn tree_sitter_language(&self) -> Language {
        match self {
            SupportedLanguage::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            SupportedLanguage::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
            SupportedLanguage::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
            SupportedLanguage::Jsx => tree_sitter_javascript::LANGUAGE.into(),
            SupportedLanguage::Rust => tree_sitter_rust::LANGUAGE.into(),
            SupportedLanguage::Python => tree_sitter_python::LANGUAGE.into(),
            SupportedLanguage::Go => tree_sitter_go::LANGUAGE.into(),
        }
    }
}

pub fn parse_file(language: SupportedLanguage, source: &[u8]) -> Result<Vec<RawSymbol>, String> {
    let mut parser = Parser::new();
    parser
        .set_language(&language.tree_sitter_language())
        .map_err(|e| format!("Failed to set language: {}", e))?;

    let tree = parser
        .parse(source, None)
        .ok_or_else(|| "Failed to parse file".to_string())?;

    let root = tree.root_node();

    let syms = match language {
        SupportedLanguage::TypeScript
        | SupportedLanguage::Tsx
        | SupportedLanguage::JavaScript
        | SupportedLanguage::Jsx => symbols::extract_symbols_typescript(root, source),
        SupportedLanguage::Rust => symbols::extract_symbols_rust(root, source),
        SupportedLanguage::Python => symbols::extract_symbols_python(root, source),
        SupportedLanguage::Go => symbols::extract_symbols_go(root, source),
    };

    Ok(syms)
}
