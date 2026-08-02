//! Consecutive same-category tool calls collapse into display groups,
//! mirroring Codex's "Exploring/Explored" grouping (`render.rs` groups
//! consecutive Read/List/Search calls into one bullet).

use serde::{Deserialize, Serialize};

/// Display categories, aligned with `frontend/src/ui/toolInline.ts` labels.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolCategory {
    Search,
    Code,
    Fetch,
    Visual,
    Plan,
    Spec,
    Read,
    Write,
    Other,
}

impl ToolCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            ToolCategory::Search => "search",
            ToolCategory::Code => "code",
            ToolCategory::Fetch => "fetch",
            ToolCategory::Visual => "visual",
            ToolCategory::Plan => "plan",
            ToolCategory::Spec => "spec",
            ToolCategory::Read => "read",
            ToolCategory::Write => "write",
            ToolCategory::Other => "other",
        }
    }
}

/// A single tool call as seen by the display layer.
///
/// `name` is the canonical wire field (tool_use event); `tool` is accepted
/// as an alias so the frontend can pass its `ToolRun`-shaped entries
/// `{id, tool, phase}` directly.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolEntry {
    pub id: String,
    #[serde(alias = "tool")]
    pub name: String,
}

/// One collapsed display row: consecutive same-category entries.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolGroup {
    pub category: ToolCategory,
    pub entries: Vec<ToolEntry>,
}

impl ToolGroup {
    pub fn count(&self) -> usize {
        self.entries.len()
    }
}

/// Classifies a tool name into a display category. The Search set matches
/// `SEARCH_TOOLS` in `toolInline.ts`; Codex-style legacy names (Read/Glob/
/// Grep/Write/Edit/Bash/WebFetch) keep their historical categories.
pub fn categorize_tool(name: &str) -> ToolCategory {
    match name {
        "web_search" | "arxiv_search" | "zotero_search" | "notion_search_pages"
        | "github_list_repos" | "gitee_list_repos" => ToolCategory::Search,
        "code_interpreter" | "Code" => ToolCategory::Code,
        "web_fetch" | "WebFetch" => ToolCategory::Fetch,
        "render_visualization" => ToolCategory::Visual,
        "create_plan" => ToolCategory::Plan,
        "create_spec" => ToolCategory::Spec,
        "Read" | "Glob" | "Grep" => ToolCategory::Read,
        "Write" | "Edit" | "Bash" => ToolCategory::Write,
        _ => ToolCategory::Other,
    }
}

/// Collapses consecutive same-category entries into groups. The order of
/// entries is preserved; a category change (or a non-consecutive reappearance)
/// starts a new group.
pub fn group_tool_calls(entries: Vec<ToolEntry>) -> Vec<ToolGroup> {
    let mut groups: Vec<ToolGroup> = Vec::new();
    for entry in entries {
        let category = categorize_tool(&entry.name);
        let merged = groups
            .last_mut()
            .is_some_and(|g: &mut ToolGroup| g.category == category);
        if merged {
            groups.last_mut().expect("just checked").entries.push(entry);
        } else {
            groups.push(ToolGroup {
                category,
                entries: vec![entry],
            });
        }
    }
    groups
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, name: &str) -> ToolEntry {
        ToolEntry { id: id.to_owned(), name: name.to_owned() }
    }

    #[test]
    fn consecutive_searches_collapse_into_one_group() {
        let groups = group_tool_calls(vec![
            entry("a", "web_search"),
            entry("b", "arxiv_search"),
            entry("c", "web_search"),
        ]);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].category, ToolCategory::Search);
        assert_eq!(groups[0].count(), 3);
    }

    #[test]
    fn category_change_starts_a_new_group() {
        let groups = group_tool_calls(vec![
            entry("a", "web_search"),
            entry("b", "code_interpreter"),
            entry("c", "web_search"),
        ]);
        assert_eq!(groups.len(), 3);
        assert_eq!(groups[0].category, ToolCategory::Search);
        assert_eq!(groups[1].category, ToolCategory::Code);
        assert_eq!(groups[2].category, ToolCategory::Search);
    }

    #[test]
    fn code_visual_plan_spec_categories() {
        let groups = group_tool_calls(vec![
            entry("a", "code_interpreter"),
            entry("b", "render_visualization"),
            entry("c", "create_plan"),
            entry("d", "create_spec"),
        ]);
        let cats: Vec<ToolCategory> = groups.iter().map(|g| g.category).collect();
        assert_eq!(cats, vec![
            ToolCategory::Code,
            ToolCategory::Visual,
            ToolCategory::Plan,
            ToolCategory::Spec,
        ]);
    }

    #[test]
    fn legacy_codex_names_keep_categories() {
        assert_eq!(categorize_tool("Read"), ToolCategory::Read);
        assert_eq!(categorize_tool("Grep"), ToolCategory::Read);
        assert_eq!(categorize_tool("Write"), ToolCategory::Write);
        assert_eq!(categorize_tool("Bash"), ToolCategory::Write);
        assert_eq!(categorize_tool("WebFetch"), ToolCategory::Fetch);
        assert_eq!(categorize_tool("Glob"), ToolCategory::Read);
    }

    #[test]
    fn unknown_names_are_other() {
        assert_eq!(categorize_tool("mystery_tool"), ToolCategory::Other);
        let groups = group_tool_calls(vec![entry("a", "mystery_tool"), entry("b", "mystery_tool")]);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].category, ToolCategory::Other);
    }

    #[test]
    fn empty_input_yields_no_groups() {
        assert!(group_tool_calls(Vec::new()).is_empty());
    }

    #[test]
    fn single_entry_is_one_group() {
        let groups = group_tool_calls(vec![entry("a", "web_search")]);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].count(), 1);
    }

    #[test]
    fn category_str_roundtrip() {
        assert_eq!(categorize_tool("web_search").as_str(), "search");
        assert_eq!(categorize_tool("code_interpreter").as_str(), "code");
        assert_eq!(categorize_tool("web_fetch").as_str(), "fetch");
    }
}
