$xml = [xml](Get-Content $args[0] -Raw)
$names = @('New chat','Library','Projects','Scheduled','Plugins','More','Search chats','Recents','Settings')
$xml.SelectNodes('//node') | ForEach-Object {
  $node = $_
  foreach ($n in $names) {
    if ($node.text -eq $n -or $node.content_desc -eq $n) {
      Write-Host ("text='" + $node.text + "' desc='" + $node.content_desc + "' bounds=" + $node.bounds)
    }
  }
}