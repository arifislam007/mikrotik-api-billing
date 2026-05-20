# PowerShell script to detect network info for macvlan setup
# Run this on Windows to find your network interface and IP

$netAdapter = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Ethernet*","Wi-Fi*" | Where-Object {$_.AddressState -eq "Preferred"}
if ($netAdapter) {
    $ip = $netAdapter.IPAddress
    $prefix = $netAdapter.PrefixLength
    $subnet = ($ip -replace '\d+$', '0') + "/" + $prefix
    $gateway = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" -InterfaceIndex $netAdapter.InterfaceIndex).NextHop
    $interface = (Get-NetAdapter -InterfaceIndex $netAdapter.InterfaceIndex).Name
    
    Write-Host "Detected Network Info:"
    Write-Host "  IP Address: $ip"
    Write-Host "  Subnet: $subnet"
    Write-Host "  Gateway: $gateway"
    Write-Host "  Interface: $interface"
    Write-Host ""
    Write-Host "Run this command to create macvlan network:"
    Write-Host "docker network create --driver macvlan --subnet=$subnet --gateway=$gateway -o parent=$interface mikrotik-macvlan"
} else {
    Write-Host "No suitable network adapter found"
}