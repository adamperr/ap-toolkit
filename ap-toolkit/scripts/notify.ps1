# Shows a Windows notification for AP Toolkit's "Needs you" alerts. Installs and changes nothing.
param(
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Text,
  [switch]$Silent
)

$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]

$title = [System.Security.SecurityElement]::Escape($Title)
$text = [System.Security.SecurityElement]::Escape($Text)
$audio = if ($Silent) { '<audio silent="true"/>' } else { '' }
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml("<toast><visual><binding template=`"ToastGeneric`"><text>$title</text><text>$text</text></binding></visual>$audio</toast>")

# Windows PowerShell's own app ID, so the alert shows without registering anything.
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show(
  [Windows.UI.Notifications.ToastNotification]::new($xml))
