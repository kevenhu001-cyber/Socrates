use std::sync::Arc;

use socrates_fetch::{fetch_one, FetchRequest, FetchResponse};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::mpsc;

fn protocol_error(id: String, reason: impl Into<String>) -> FetchResponse {
    FetchResponse {
        id,
        ok: false,
        status: 0,
        original_url: String::new(),
        final_url: None,
        headers: Default::default(),
        body: String::new(),
        truncated: false,
        reason: Some(reason.into()),
        article: None,
    }
}

#[tokio::main(flavor = "multi_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let stdin = BufReader::new(tokio::io::stdin());
    let mut lines = stdin.lines();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let tx = Arc::new(tx);

    let writer = tokio::spawn(async move {
        let mut stdout = tokio::io::BufWriter::new(tokio::io::stdout());
        while let Some(line) = rx.recv().await {
            stdout.write_all(line.as_bytes()).await?;
            stdout.write_all(b"\n").await?;
            stdout.flush().await?;
        }
        stdout.flush().await?;
        Ok::<(), std::io::Error>(())
    });

    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let tx = Arc::clone(&tx);
        tokio::spawn(async move {
            let response = match serde_json::from_str::<FetchRequest>(&line) {
                Ok(request) => fetch_one(request).await,
                Err(err) => protocol_error(String::new(), format!("Invalid request: {err}")),
            };
            if let Ok(json) = serde_json::to_string(&response) {
                let _ = tx.send(json);
            }
        });
    }
    drop(tx);
    writer.await??;
    Ok(())
}
