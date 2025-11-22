$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Open('C:\Users\ridle\Dropbox\FIT\CLIENTS\sonomika\docs\Sonomica licence.doc')
$text = $doc.Content.Text
$doc.Close($false)
$word.Quit($false)
$text | Out-File -FilePath 'extracted_license.txt' -Encoding utf8

