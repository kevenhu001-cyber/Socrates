Set-Location C:\Users\Jiacheng\Desktop\Socrates
Select-String -Path .qoder-pw-visual.log,.qoder-pw-interact.log -Pattern '^\s+\d+\). $|Error:|expect\(|Received|Assertion' |
  ForEach-Object { $_.Line.Trim() } | Select-Object -First 100
