{
  "manifest_version": 2,
  "name": "DNLA Test",
  "version": "0.1",
  "minimum_chrome_version": "23",
  "app": { "background": { "scripts": ["main.js"] } },
  "permissions": [ 
    {"socket": ["udp-bind", "udp-send-to", "udp-multicast-membership"]},
    "http://*/", 
    "https://*/"
  ] 
}