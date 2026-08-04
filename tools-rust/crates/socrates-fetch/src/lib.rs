//! Native fetch core for Socrates' `web_fetch` tool.
//!
//! The Node server still owns authentication, rate limiting, HTML content
//! extraction, caching, and the public response contract. This crate owns
//! the part that benefits from a small native worker: URL policy, DNS
//! resolution, pinned connections, redirect validation, bounded response
//! reads, cancellation/timeouts, and an optional text-density extractor.

use std::collections::{BTreeMap, HashSet};
use std::fmt;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use tokio::net::lookup_host;
use tokio::time::timeout;
use url::Url;

const DEFAULT_MAX_BYTES: usize = 200_000;
const DEFAULT_MAX_REDIRECTS: usize = 10;
const DEFAULT_TIMEOUT_MS: u64 = 10_000;
const DNS_TIMEOUT_MS: u64 = 3_000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRequest {
    pub id: String,
    pub url: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default = "default_max_bytes")]
    pub max_bytes: usize,
    #[serde(default = "default_max_redirects")]
    pub max_redirects: usize,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
    #[serde(default)]
    pub extract: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedArticle {
    pub title: String,
    pub byline: Option<String>,
    pub site_name: Option<String>,
    pub excerpt: String,
    pub content: String,
    pub length: usize,
    pub date: Option<String>,
    pub method: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResponse {
    pub id: String,
    pub ok: bool,
    pub status: u16,
    pub original_url: String,
    pub final_url: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub headers: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub body: String,
    #[serde(default)]
    pub truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub article: Option<ExtractedArticle>,
}

#[derive(Debug)]
pub enum FetchError {
    InvalidUrl(String),
    Blocked(String),
    Dns(String),
    Network(String),
    Internal(String),
}

impl fmt::Display for FetchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidUrl(message)
            | Self::Blocked(message)
            | Self::Dns(message)
            | Self::Network(message)
            | Self::Internal(message) => f.write_str(message),
        }
    }
}

impl std::error::Error for FetchError {}

fn default_max_bytes() -> usize {
    DEFAULT_MAX_BYTES
}

fn default_max_redirects() -> usize {
    DEFAULT_MAX_REDIRECTS
}

fn default_timeout_ms() -> u64 {
    DEFAULT_TIMEOUT_MS
}

/// Returns true for addresses that must never be reached by a user-supplied
/// URL. This deliberately includes reserved, multicast, CGNAT, NAT64 and
/// 6to4 ranges in addition to the usual RFC1918/loopback ranges.
pub fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_private_ipv4(ip),
        IpAddr::V6(ip) => {
            if let Some(mapped) = mapped_ipv4(ip) {
                return is_private_ipv4(mapped);
            }
            is_private_ipv6(ip)
        }
    }
}

fn is_private_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    let [a, b, _, _] = octets;
    a == 0
        || a == 10
        || a == 127
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 168)
        || (a == 100 && (64..=127).contains(&b))
        || a >= 224
}

fn is_private_ipv6(ip: Ipv6Addr) -> bool {
    let segments = ip.segments();
    let first = segments[0];
    let second = segments[1];

    ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_multicast()
        || (first & 0xfe00) == 0xfc00 // fc00::/7 ULA
        || (first & 0xffc0) == 0xfe80 // fe80::/10 link-local
        || first == 0x2002 // 2002::/16 6to4
        || (first == 0x0064 && second == 0xff9b) // 64:ff9b::/96 NAT64
        || (first == 0x0100 && second == 0) // 100::/64 discard-only
}

fn mapped_ipv4(ip: Ipv6Addr) -> Option<Ipv4Addr> {
    let octets = ip.octets();
    if octets[..10].iter().all(|byte| *byte == 0) && octets[10] == 0xff && octets[11] == 0xff {
        Some(Ipv4Addr::new(
            octets[12], octets[13], octets[14], octets[15],
        ))
    } else {
        None
    }
}

fn validate_url(raw: &str) -> Result<Url, FetchError> {
    let url = Url::parse(raw)
        .map_err(|err| FetchError::InvalidUrl(format!("Blocked: invalid URL ({err})")))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(FetchError::Blocked("Blocked: non-http(s) URL".to_owned()));
    }
    if url.host_str().is_none() {
        return Err(FetchError::Blocked(
            "Blocked: URL has no hostname".to_owned(),
        ));
    }
    Ok(url)
}

async fn resolve_public(host: &str, port: u16) -> Result<Vec<IpAddr>, FetchError> {
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_private_ip(ip) {
            return Err(FetchError::Blocked(format!(
                "Blocked: {host} resolves to private IP {ip}"
            )));
        }
        return Ok(vec![ip]);
    }

    let resolved = timeout(
        Duration::from_millis(DNS_TIMEOUT_MS),
        lookup_host((host, port)),
    )
    .await
    .map_err(|_| FetchError::Dns("dns-timeout".to_owned()))?
    .map_err(|err| FetchError::Dns(format!("DNS lookup failed for {host}: {err}")))?;

    let mut addresses = Vec::new();
    let mut seen = HashSet::new();
    for address in resolved {
        if !seen.insert(address.ip()) {
            continue;
        }
        if is_private_ip(address.ip()) {
            return Err(FetchError::Blocked(format!(
                "Blocked: {host} resolves to private IP {}",
                address.ip()
            )));
        }
        addresses.push(address.ip());
    }
    if addresses.is_empty() {
        return Err(FetchError::Dns(format!(
            "DNS lookup returned no addresses for {host}"
        )));
    }
    Ok(addresses)
}

fn request_headers(request: &FetchRequest) -> Result<HeaderMap, FetchError> {
    let mut headers = HeaderMap::new();
    for (name, value) in &request.headers {
        let name = HeaderName::try_from(name)
            .map_err(|err| FetchError::Internal(format!("invalid request header {name}: {err}")))?;
        let value = HeaderValue::try_from(value)
            .map_err(|err| FetchError::Internal(format!("invalid request header value: {err}")))?;
        headers.insert(name, value);
    }
    Ok(headers)
}

fn response_headers(response: &reqwest::Response) -> BTreeMap<String, String> {
    let mut headers = BTreeMap::new();
    for name in ["content-type", "etag", "last-modified"] {
        if let Some(value) = response
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
        {
            headers.insert(name.to_owned(), value.to_owned());
        }
    }
    headers
}

fn is_supported_content_type(headers: &BTreeMap<String, String>) -> bool {
    let content_type = headers
        .get("content-type")
        .map(String::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    content_type.contains("text") || content_type.contains("json") || content_type.contains("html")
}

const EXTRACT_MIN_CHARS: usize = 250;
const EXTRACT_MAX_CHARS: usize = 8_000;

#[derive(Clone, Debug)]
struct TextBlock {
    tag: String,
    text: String,
}

#[derive(Default, Debug)]
struct Candidate {
    text: String,
    link_count: usize,
    blocks: Vec<TextBlock>,
}

#[derive(Debug)]
struct Frame {
    tag: String,
    skip: bool,
    candidate_ids: Vec<usize>,
    block_id: Option<usize>,
}

fn is_candidate_tag(tag: &str) -> bool {
    matches!(tag, "article" | "main" | "div" | "section")
}

fn is_block_tag(tag: &str) -> bool {
    matches!(tag, "p" | "li" | "h2" | "h3" | "blockquote" | "pre")
}

fn is_void_tag(tag: &str) -> bool {
    matches!(
        tag,
        "area"
            | "base"
            | "br"
            | "col"
            | "embed"
            | "hr"
            | "img"
            | "input"
            | "link"
            | "meta"
            | "param"
            | "source"
            | "track"
            | "wbr"
    )
}

fn find_tag_end(bytes: &[u8], start: usize) -> usize {
    let mut quote = 0u8;
    for index in start..bytes.len() {
        match bytes[index] {
            b'"' | b'\'' if quote == 0 => quote = bytes[index],
            value if value == quote => quote = 0,
            b'>' if quote == 0 => return index,
            _ => {}
        }
    }
    bytes.len().saturating_sub(1)
}

fn parse_tag(raw: &str) -> Option<(bool, String, String, bool)> {
    let mut value = raw.trim();
    if value.starts_with('!') || value.starts_with('?') {
        return None;
    }
    let closing = value.starts_with('/');
    if closing {
        value = value[1..].trim_start();
    }
    let name_end = value
        .find(|character: char| character.is_ascii_whitespace() || character == '/')
        .unwrap_or(value.len());
    if name_end == 0 {
        return None;
    }
    let name = value[..name_end].to_ascii_lowercase();
    let attributes = value[name_end..]
        .trim()
        .trim_end_matches('/')
        .trim()
        .to_owned();
    let self_closing = !closing && (raw.trim_end().ends_with('/') || is_void_tag(&name));
    Some((closing, name, attributes, self_closing))
}

fn attribute(attributes: &str, wanted: &str) -> Option<String> {
    let bytes = attributes.as_bytes();
    let mut index = 0usize;
    while index < bytes.len() {
        while index < bytes.len() && (bytes[index].is_ascii_whitespace() || bytes[index] == b'/') {
            index += 1;
        }
        let start = index;
        while index < bytes.len()
            && !bytes[index].is_ascii_whitespace()
            && bytes[index] != b'='
            && bytes[index] != b'/'
        {
            index += 1;
        }
        if start == index {
            index += 1;
            continue;
        }
        let name = &attributes[start..index];
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        if index >= bytes.len() || bytes[index] != b'=' {
            continue;
        }
        index += 1;
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        if index >= bytes.len() {
            return None;
        }
        let value_start;
        let value_end;
        if bytes[index] == b'"' || bytes[index] == b'\'' {
            let quote = bytes[index];
            index += 1;
            value_start = index;
            while index < bytes.len() && bytes[index] != quote {
                index += 1;
            }
            value_end = index;
            if index < bytes.len() {
                index += 1;
            }
        } else {
            value_start = index;
            while index < bytes.len() && !bytes[index].is_ascii_whitespace() {
                index += 1;
            }
            value_end = index;
        }
        if name.eq_ignore_ascii_case(wanted) {
            return Some(attributes[value_start..value_end].to_owned());
        }
    }
    None
}

fn is_noise_tag(tag: &str, attributes: &str) -> bool {
    if matches!(
        tag,
        "script"
            | "style"
            | "noscript"
            | "svg"
            | "iframe"
            | "nav"
            | "header"
            | "footer"
            | "aside"
            | "form"
    ) {
        return true;
    }
    if attribute(attributes, "aria-hidden").is_some_and(|value| value.eq_ignore_ascii_case("true"))
    {
        return true;
    }
    if attribute(attributes, "role").is_some_and(|value| {
        matches!(
            value.to_ascii_lowercase().as_str(),
            "navigation" | "banner" | "contentinfo"
        )
    }) {
        return true;
    }
    let id = attribute(attributes, "id")
        .unwrap_or_default()
        .to_ascii_lowercase();
    let class = attribute(attributes, "class")
        .unwrap_or_default()
        .to_ascii_lowercase();
    [id, class]
        .iter()
        .any(|value| value.contains("ad-") || value.contains("advert") || value.contains("-banner"))
}

fn decode_entities(text: &str) -> String {
    let common = text
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'");
    let mut output = String::with_capacity(common.len());
    let mut rest = common.as_str();
    while let Some(start) = rest.find("&#") {
        output.push_str(&rest[..start]);
        let Some(end_offset) = rest[start..].find(';') else {
            output.push_str(&rest[start..]);
            rest = "";
            break;
        };
        let end = start + end_offset;
        let entity = &rest[start + 2..end];
        let parsed = if let Some(hex) = entity
            .strip_prefix('x')
            .or_else(|| entity.strip_prefix('X'))
        {
            u32::from_str_radix(hex, 16).ok()
        } else {
            entity.parse::<u32>().ok()
        };
        if let Some(code_point) = parsed.and_then(char::from_u32) {
            output.push(code_point);
        } else {
            output.push_str(&rest[start..=end]);
        }
        rest = &rest[end + 1..];
    }
    output.push_str(rest);
    output
}

fn clean_text(raw: &str) -> String {
    let decoded = decode_entities(raw).replace('\u{a0}', " ");
    let mut output = String::with_capacity(decoded.len());
    let mut pending_space = false;
    let mut newline_run = 0usize;
    for character in decoded.chars() {
        match character {
            '\r' => continue,
            '\n' => {
                newline_run += 1;
                continue;
            }
            ' ' | '\t' => pending_space = true,
            character => {
                while output.ends_with(' ') {
                    output.pop();
                }
                if newline_run >= 2 {
                    if !output.ends_with('\n') && !output.is_empty() {
                        output.push('\n');
                    }
                } else if newline_run == 1 {
                    pending_space = true;
                }
                if pending_space
                    && !output.is_empty()
                    && !output.ends_with(' ')
                    && !output.ends_with('\n')
                {
                    output.push(' ');
                }
                output.push(character);
                pending_space = false;
                newline_run = 0;
            }
        }
    }
    if newline_run >= 2 && !output.ends_with('\n') && !output.is_empty() {
        output.push('\n');
    }
    let mut lines = Vec::new();
    for line in output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        lines.push(line.to_owned());
    }
    if lines.is_empty() {
        return String::new();
    }
    // `lines` already removes long runs of empty lines; joining with a blank
    // line gives the LLM the same paragraph separation as the JS extractor.
    lines.join("\n\n").trim().to_owned()
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

fn normalize_date(raw: &str) -> Option<String> {
    let raw = raw.trim();
    for (start, _) in raw.char_indices() {
        let candidate = &raw[start..];
        let candidate_bytes = candidate.as_bytes();
        if candidate_bytes.len() < 10
            || !candidate_bytes[0..4].iter().all(u8::is_ascii_digit)
            || !matches!(candidate_bytes[4], b'-' | b'/')
            || !candidate_bytes[5..7].iter().all(u8::is_ascii_digit)
            || !matches!(candidate_bytes[7], b'-' | b'/')
            || !candidate_bytes[8..10].iter().all(u8::is_ascii_digit)
        {
            continue;
        }
        let year = candidate[0..4].parse::<u32>().ok()?;
        let month = candidate[5..7].parse::<u32>().ok()?;
        let day = candidate[8..10].parse::<u32>().ok()?;
        if (1990..=2100).contains(&year) && (1..=12).contains(&month) && (1..=31).contains(&day) {
            return Some(format!("{year:04}-{month:02}-{day:02}"));
        }
    }
    None
}

fn append_text(
    text: &str,
    frames: &[Frame],
    candidates: &mut [Candidate],
    blocks: &mut [TextBlock],
) {
    if text.is_empty() || frames.iter().any(|frame| frame.skip) {
        return;
    }
    let candidate_ids = frames
        .iter()
        .flat_map(|frame| frame.candidate_ids.iter().copied())
        .collect::<HashSet<_>>();
    for candidate_id in candidate_ids {
        candidates[candidate_id].text.push_str(text);
    }
    let block_ids = frames
        .iter()
        .filter_map(|frame| frame.block_id)
        .collect::<HashSet<_>>();
    for block_id in block_ids {
        blocks[block_id].text.push_str(text);
    }
}

fn close_frame(
    tag: &str,
    frames: &mut Vec<Frame>,
    candidates: &mut [Candidate],
    blocks: &[TextBlock],
) {
    while let Some(frame) = frames.pop() {
        if let Some(block_id) = frame.block_id {
            let block = blocks[block_id].clone();
            for candidate_id in frame.candidate_ids {
                candidates[candidate_id].blocks.push(block.clone());
            }
        }
        if frame.tag == tag {
            break;
        }
    }
}

/// A deliberately bounded HTML text-density extractor. It does not attempt
/// to reproduce Mozilla Readability's full scoring model; it is a fast native
/// candidate path and returns `None` when the page is too thin to trust.
pub fn extract_html(html: &str, url: &str) -> Option<ExtractedArticle> {
    if html.is_empty() {
        return None;
    }
    let bytes = html.as_bytes();
    let mut frames = Vec::new();
    let mut candidates = Vec::<Candidate>::new();
    let mut blocks = Vec::<TextBlock>::new();
    let mut title = String::new();
    let mut date = None;
    let mut cursor = 0usize;

    while cursor < bytes.len() {
        if bytes[cursor] != b'<' {
            let end = html[cursor..]
                .find('<')
                .map(|offset| cursor + offset)
                .unwrap_or(bytes.len());
            let text = &html[cursor..end];
            append_text(text, &frames, &mut candidates, &mut blocks);
            if frames
                .iter()
                .any(|frame| frame.tag == "title" && !frame.skip)
            {
                title.push_str(text);
            }
            cursor = end;
            continue;
        }
        if html[cursor..].starts_with("<!--") {
            cursor = html[cursor + 4..]
                .find("-->")
                .map(|offset| cursor + 4 + offset + 3)
                .unwrap_or(bytes.len());
            continue;
        }
        let end = find_tag_end(bytes, cursor + 1);
        if end < cursor {
            break;
        }
        let raw_tag = &html[cursor + 1..end];
        let Some((closing, tag, attributes, self_closing)) = parse_tag(raw_tag) else {
            cursor = end.saturating_add(1);
            continue;
        };
        if closing {
            close_frame(&tag, &mut frames, &mut candidates, &blocks);
            cursor = end.saturating_add(1);
            continue;
        }

        if tag == "meta" {
            let key = attribute(&attributes, "property")
                .or_else(|| attribute(&attributes, "name"))
                .or_else(|| attribute(&attributes, "itemprop"))
                .unwrap_or_default()
                .to_ascii_lowercase();
            if date.is_none()
                && (key.contains("published") || key.contains("pubdate") || key == "date")
            {
                date = attribute(&attributes, "content").and_then(|value| normalize_date(&value));
            }
        } else if tag == "time" && date.is_none() {
            date = attribute(&attributes, "datetime").and_then(|value| normalize_date(&value));
        }

        let inherited_skip = frames.last().is_some_and(|frame| frame.skip);
        let skip = inherited_skip || is_noise_tag(&tag, &attributes);
        let mut candidate_ids = frames
            .last()
            .map(|frame| frame.candidate_ids.clone())
            .unwrap_or_default();
        if !skip && is_candidate_tag(&tag) {
            let candidate_id = candidates.len();
            candidates.push(Candidate::default());
            candidate_ids.push(candidate_id);
        }
        if !skip && tag == "a" {
            for candidate_id in &candidate_ids {
                candidates[*candidate_id].link_count += 1;
            }
        }
        if !skip && is_block_tag(&tag) {
            append_text("\n\n", &frames, &mut candidates, &mut blocks);
        }
        let block_id = if !skip && is_block_tag(&tag) {
            let block_id = blocks.len();
            blocks.push(TextBlock {
                tag: tag.clone(),
                text: String::new(),
            });
            Some(block_id)
        } else {
            None
        };
        if !self_closing {
            frames.push(Frame {
                tag,
                skip,
                candidate_ids,
                block_id,
            });
        }
        cursor = end.saturating_add(1);
    }
    while !frames.is_empty() {
        let tag = frames
            .last()
            .map(|frame| frame.tag.clone())
            .unwrap_or_default();
        close_frame(&tag, &mut frames, &mut candidates, &blocks);
    }

    let best = candidates
        .iter()
        .filter_map(|candidate| {
            let text = clean_text(&candidate.text);
            let chars = text.chars().count();
            if chars < EXTRACT_MIN_CHARS {
                return None;
            }
            let score = chars as i64 - candidate.link_count as i64 * 50;
            Some((score, text, candidate))
        })
        .max_by_key(|(score, _, _)| *score)?;
    let content = {
        let mut parts = Vec::new();
        for block in &best.2.blocks {
            let text = clean_text(&block.text);
            if text.is_empty() {
                continue;
            }
            let formatted = match block.tag.as_str() {
                "h2" | "h3" => format!("## {text}"),
                "li" => format!("• {text}"),
                _ => text,
            };
            parts.push(formatted);
        }
        let structured = clean_text(&parts.join("\n\n"));
        let content = if structured.chars().count() >= EXTRACT_MIN_CHARS {
            structured
        } else {
            best.1.clone()
        };
        truncate_chars(&content, EXTRACT_MAX_CHARS)
    };
    if content.chars().count() < EXTRACT_MIN_CHARS {
        return None;
    }
    let excerpt = {
        let one_line = content.split_whitespace().collect::<Vec<_>>().join(" ");
        let chars = one_line.chars().collect::<Vec<_>>();
        if chars.len() > 320 {
            format!("{}…", chars[..317].iter().collect::<String>())
        } else {
            one_line
        }
    };
    let site_name = Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_owned));
    Some(ExtractedArticle {
        title: clean_text(&title),
        byline: None,
        site_name,
        excerpt,
        length: content.chars().count(),
        content,
        date,
        method: "heuristic-rust".to_owned(),
    })
}

fn error_response(request: &FetchRequest, status: u16, reason: impl Into<String>) -> FetchResponse {
    FetchResponse {
        id: request.id.clone(),
        ok: false,
        status,
        original_url: request.url.clone(),
        final_url: None,
        headers: BTreeMap::new(),
        body: String::new(),
        truncated: false,
        reason: Some(reason.into()),
        article: None,
    }
}

async fn get_with_pinned_ip(
    url: &Url,
    ip: IpAddr,
    headers: &HeaderMap,
    timeout_duration: Duration,
) -> Result<reqwest::Response, FetchError> {
    let host = url
        .host_str()
        .ok_or_else(|| FetchError::Blocked("Blocked: URL has no hostname".to_owned()))?;
    let port = url.port_or_known_default().unwrap_or(443);
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(timeout_duration)
        .resolve(host, SocketAddr::new(ip, port))
        .build()
        .map_err(|err| FetchError::Internal(format!("failed to build HTTP client: {err}")))?;

    client
        .get(url.clone())
        .headers(headers.clone())
        .send()
        .await
        .map_err(|err| FetchError::Network(err.to_string()))
}

/// Fetch one URL with manual, per-hop SSRF validation and bounded body reads.
pub async fn fetch_one(request: FetchRequest) -> FetchResponse {
    let original_url = request.url.clone();
    let mut current = match validate_url(&request.url) {
        Ok(url) => url,
        Err(err) => return error_response(&request, 0, err.to_string()),
    };
    let request_headers = match request_headers(&request) {
        Ok(headers) => headers,
        Err(err) => return error_response(&request, 0, err.to_string()),
    };

    let timeout_duration = Duration::from_millis(request.timeout_ms.max(1));
    let deadline = tokio::time::Instant::now() + timeout_duration;
    let mut current_addresses = match resolve_public(
        current.host_str().unwrap_or_default(),
        current.port_or_known_default().unwrap_or(443),
    )
    .await
    {
        Ok(addresses) => addresses,
        Err(err) => return error_response(&request, 0, err.to_string()),
    };
    let mut redirects = 0usize;

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return error_response(&request, 0, "Request timed out");
        }

        let mut response = None;
        let mut last_error = None;
        for ip in &current_addresses {
            match get_with_pinned_ip(&current, *ip, &request_headers, remaining).await {
                Ok(value) => {
                    response = Some(value);
                    break;
                }
                Err(err) => last_error = Some(err.to_string()),
            }
        }
        let response = match response {
            Some(response) => response,
            None => {
                return error_response(
                    &request,
                    0,
                    last_error.unwrap_or_else(|| "Fetch failed".to_owned()),
                )
            }
        };

        let status = response.status();
        if status.is_redirection() {
            if redirects >= request.max_redirects {
                return error_response(&request, status.as_u16(), "Too many redirects");
            }
            let location = match response.headers().get(reqwest::header::LOCATION) {
                Some(location) => match location.to_str() {
                    Ok(location) => location,
                    Err(_) => {
                        return error_response(
                            &request,
                            status.as_u16(),
                            "Redirect with invalid Location header",
                        )
                    }
                },
                None => {
                    return error_response(
                        &request,
                        status.as_u16(),
                        "Redirect with no Location header",
                    )
                }
            };
            let next = match current.join(location) {
                Ok(next) => next,
                Err(err) => {
                    return error_response(
                        &request,
                        status.as_u16(),
                        format!("Invalid redirect URL: {err}"),
                    )
                }
            };
            if next.scheme() != "http" && next.scheme() != "https" {
                return error_response(
                    &request,
                    status.as_u16(),
                    "Blocked: redirect to non-http(s) URL",
                );
            }
            let next_host = next.host_str().unwrap_or_default();
            if next_host != current.host_str().unwrap_or_default() {
                current_addresses =
                    match resolve_public(next_host, next.port_or_known_default().unwrap_or(443))
                        .await
                    {
                        Ok(addresses) => addresses,
                        Err(err) => {
                            return error_response(
                                &request,
                                status.as_u16(),
                                format!("Blocked: redirect to {next_host} — {err}"),
                            )
                        }
                    };
            }
            current = next;
            redirects += 1;
            continue;
        }

        let headers = response_headers(&response);
        if status == StatusCode::NOT_MODIFIED {
            return FetchResponse {
                id: request.id,
                ok: true,
                status: status.as_u16(),
                original_url,
                final_url: Some(current.to_string()),
                headers,
                body: String::new(),
                truncated: false,
                reason: None,
                article: None,
            };
        }
        if !status.is_success() {
            return error_response(
                &request,
                status.as_u16(),
                format!("HTTP {}", status.as_u16()),
            );
        }
        if !is_supported_content_type(&headers) {
            let content_type = headers.get("content-type").cloned().unwrap_or_default();
            return error_response(
                &request,
                status.as_u16(),
                format!("Unsupported content type: {content_type}"),
            );
        }

        let max_bytes = request.max_bytes.max(1);
        let mut body = Vec::with_capacity(max_bytes.min(16 * 1024));
        let mut truncated = false;
        let mut response = response;
        loop {
            match response.chunk().await {
                Ok(Some(chunk)) => {
                    let remaining = max_bytes.saturating_sub(body.len());
                    if chunk.len() > remaining {
                        body.extend_from_slice(&chunk[..remaining]);
                        truncated = true;
                        break;
                    }
                    body.extend_from_slice(&chunk);
                }
                Ok(None) => break,
                Err(err) => {
                    return error_response(
                        &request,
                        status.as_u16(),
                        format!("Fetch failed: {err}"),
                    )
                }
            }
        }

        let body = String::from_utf8_lossy(&body).into_owned();
        let article = if request.extract {
            extract_html(&body, current.as_str())
        } else {
            None
        };
        return FetchResponse {
            id: request.id,
            ok: true,
            status: status.as_u16(),
            original_url,
            final_url: Some(current.to_string()),
            headers,
            body,
            truncated,
            reason: None,
            article,
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_private_ipv4_ranges() {
        for raw in [
            "0.0.0.0",
            "10.1.2.3",
            "127.0.0.1",
            "169.254.169.254",
            "172.16.0.1",
            "192.168.1.1",
            "100.64.0.1",
            "224.0.0.1",
        ] {
            assert!(is_private_ip(raw.parse().unwrap()), "{raw}");
        }
        assert!(!is_private_ip("93.184.216.34".parse().unwrap()));
    }

    #[test]
    fn blocks_private_ipv6_and_mapped_ipv4() {
        for raw in [
            "::",
            "::1",
            "fc00::1",
            "fe80::1",
            "2002::1",
            "64:ff9b::1",
            "100::1",
            "::ffff:127.0.0.1",
        ] {
            assert!(is_private_ip(raw.parse().unwrap()), "{raw}");
        }
        assert!(!is_private_ip("2001:4860:4860::8888".parse().unwrap()));
    }

    #[test]
    fn validates_only_http_urls() {
        assert!(validate_url("https://example.com/article").is_ok());
        assert!(validate_url("file:///etc/passwd").is_err());
        assert!(validate_url("not-a-url").is_err());
    }

    #[test]
    fn request_defaults_are_deserialised() {
        let request: FetchRequest =
            serde_json::from_str(r#"{"id":"1","url":"https://example.com"}"#).unwrap();
        assert_eq!(request.max_bytes, DEFAULT_MAX_BYTES);
        assert_eq!(request.max_redirects, DEFAULT_MAX_REDIRECTS);
        assert_eq!(request.timeout_ms, DEFAULT_TIMEOUT_MS);
        assert!(!request.extract);
    }

    #[test]
    fn extracts_article_text_and_metadata_without_navigation_noise() {
        let paragraph = "Important research content appears here. ".repeat(12);
        let html = format!(
            r#"<html><head><title>Research &amp; Notes</title>
                <meta property="article:published_time" content="2026-08-04T12:00:00Z"></head>
                <body><nav>Ignore this navigation and its links.</nav>
                <main><article><h2>Findings</h2><p>{paragraph}</p>
                <p>Second paragraph with a numeric entity: &#x41;.</p></article></main>
                <footer>Ignore this footer.</footer></body></html>"#
        );
        let article = extract_html(&html, "https://example.com/research").expect("article");
        assert_eq!(article.title, "Research & Notes");
        assert_eq!(article.date.as_deref(), Some("2026-08-04"));
        assert_eq!(article.site_name.as_deref(), Some("example.com"));
        assert_eq!(article.method, "heuristic-rust");
        assert!(article.content.contains("Findings"));
        assert!(article.content.contains("Important research content"));
        assert!(article.content.contains("numeric entity: A"));
        assert!(!article.content.contains("Ignore this navigation"));
        assert!(!article.content.contains("Ignore this footer"));
    }

    #[test]
    fn rejects_thin_pages_and_caps_long_content() {
        assert!(extract_html(
            "<html><body><main>too short</main></body></html>",
            "https://example.com"
        )
        .is_none());
        let long = "content ".repeat(3_000);
        let html = format!("<main><p>{long}</p></main>");
        let article = extract_html(&html, "https://example.com").expect("long article");
        assert_eq!(article.length, EXTRACT_MAX_CHARS);
        assert!(article.content.chars().count() <= EXTRACT_MAX_CHARS);
    }
}
