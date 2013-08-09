// Random hacks to test out web service discovery via broadcast sockets
// Support goal: 
//      SSDP (media players, routers etc)
//      WSD (printers, newwer computers)
//      NBT (legacy computers, some network devices)

document.addEventListener('DOMContentLoaded', function () {
    document.querySelector('#connectButton').addEventListener('click', initUDP);
    document.querySelector('#searchButton').addEventListener('click', devicesSearch);
    var info = document.getElementById('info');
    info.innerHTML += 'Started';
});

/*
function connectUDP() {
  chrome.socket.create('udp', { }, function(createInfo){
    var clientSocket = createInfo.socketId;
    
    chrome.socket.bind(clientSocket, "0.0.0.0", 1900, function(result) {
      chrome.socket.recvFrom(clientSocket, function(recvFromInfo) {
        console.log('recv: ' + recvFromInfo.data);
      });
    });   
  });
}
*/

// Hash of device found on the local network, indexed by 'IP'
var g_serviceDevices = {};
var g_ssdpSocket;
var g_wsdSocket;

function ServiceDevice(location, ip, manufacturer, model, friendlyName, presentationUrl) {
    this.location = location;
    this.manufacturer = manufacturer;
    this.model = model;
    this.friendlyName = friendlyName;
    this.ip = ip;
    this.presentationUrl = presentationUrl;
}

/*
function getServiceType(data) {
    var lines = data.split("\r\n");
    for (var i=1; i<lines.length; i++) {
        var line = lines[i];
        var delimPos = line.indexOf(":");
        if (line.substring(0, delimPos) == "ST") {
            return line.substring(delimPos+1);
        }
    }
}
*/

function getSsdpDeviceInfo(data) {
    var lines = data.split("\r\n");
    var info = {};
    for (var i=1; i<lines.length; i++) {
        var line = lines[i];
        var delimPos = line.indexOf(":");
        if (delimPos > 0) {
            info[line.substring(0, delimPos).toUpperCase()] = line.substring(delimPos+1);
        }
    }
    return info;
}

// Update the XML-based info like Friendly Name
/*
function updateXmlInfo(address) {
    var ssdpDevice = serviceDevices[address];
    var location = ssdpDevice.location;
    if (!location) {
        return;
    }

    var xhr = new XMLHttpRequest();
    xhr.ssdpDevice = ssdpDevice;
    xhr.open("GET", location, true);
    xhr.onreadystatechange = xhrReadyStateChange;
    xhr.send();
}
*/

function updateXmlInfo(ssdpDevice) {
    var xhr = new XMLHttpRequest();
    xhr.ssdpDevice = ssdpDevice;
    xhr.open("GET", ssdpDevice.location, true);
    xhr.onreadystatechange = updateXmlInfoRSC;
    xhr.send();
}

function getXmlDataForTag(xml, tagName) {
    var elements = xml.getElementsByTagName(tagName);
    if (elements && elements.length > 0) {
        var childNodes = elements[0].childNodes;
        if (childNodes && childNodes.length > 0) {
            return childNodes[0].data;
        }
    }
}

function updateXmlInfoRSC(e) {
    if (this.readyState == 4) {
        if (this.status == 200 && this.responseXML) {
            var xml = this.responseXML;
            this.ssdpDevice.friendlyName = getXmlDataForTag(xml, "friendlyName");
            this.ssdpDevice.manufacturer = getXmlDataForTag(xml, "manufacturer");
            this.ssdpDevice.model = getXmlDataForTag(xml, "modelName");
            this.ssdpDevice.presentationUrl = getXmlDataForTag(xml, "presentationURL");
            console.log(this.ssdpDevice.manufacturer + " " + this.ssdpDevice.model + " " + this.ssdpDevice.friendlyName + " " + this.ssdpDevice.ip);
            console.log(this.ssdpDevice.presentationUrl);     
        }
    }    
}

function ssdpRecvLoop(socketId) {
    // console.log("recvFrom:...");
    chrome.socket.recvFrom(socketId, 4096, function (result) {
        if (result.resultCode >= 0) {
            // console.log("ssdpRrecvFrom: " + result.address);
            var dv = new DataView(result.data);
            var blob = new Blob([dv]);
            var fr = new FileReader();
            fr.onload = function (e) {
                // var st = getServiceType(e.target.result);
                var info = getSsdpDeviceInfo(e.target.result);
                var location = info["LOCATION"];
                // Keep track of devices by location
                if (location && !(location in g_serviceDevices)) {
                    var ssdpDevice = new ServiceDevice(location, result.address);
                    g_serviceDevices[location] = ssdpDevice;
                    updateXmlInfo(ssdpDevice);
                }                   
                    
/*                    
                // Update location (can be undefined)
                // New location or it changed
                // NB Deliberately ignoring ssdp:byebye (since udp is unreliable)
                
                if (!(result.address in serviceDevices)) {
                    serviceDevices[result.address] = new ServiceDevice("",result.address);
                }                
                if (location && serviceDevices[result.address].location.valueOf() != location.valueOf()) {
                    serviceDevices[result.address].location = location;
                    console.log(result.address + " " + location);
                    updateXmlInfo(result.address);
                }
*/
            };
            fr.readAsText(blob);
            ssdpRecvLoop(socketId);
        } else {
            // TODO: Handle error -4?
            console.log("recvFrom: " + result.resultCode);
        }
    });   
}

function wsdRecvLoop(socketId) {
    console.log("wsdRecvFrom:...");
    chrome.socket.recvFrom(socketId, 4096, function (result) {
        if (result.resultCode >= 0) {
            console.log("wsdRecvFrom: " + result.address);
            var dv = new DataView(result.data);
            var blob = new Blob([dv]);
            var fr = new FileReader();
            fr.onload = function (e) {
                var txt = e.target.result;
                var parser = new DOMParser();
                var xml = parser.parseFromString(txt,"text/xml");
                // TODO Debug: show types
                console.log("wsdrcl: types: " + getXmlDataForTag(xml, "Types"));
                // 1) Envelope.Body.Probe.Types
                // TODOD location is XAddrs 
                // 2) Envelope.Body.ProbeMatches.ProbeMatch.XAddrs                
                var location = getXmlDataForTag(xml, "XAddrs");
                if (location) {
                    var wsDevice = new ServiceDevice(location, result.address);
                    g_serviceDevices[location] = wsDevice;
                    getWsdDeviceInfo(wsDevice);
                }
            };
            fr.readAsText(blob);
            wsdRecvLoop(socketId);
        } else {
            // TODO: Handle error -4?
            console.log("wsdRecvFrom: " + result.resultCode);
        }
    });   
}

function initUDP() {
    if (g_ssdpSocket) {
        chrome.socket.destroy(g_ssdpSocket.socketId);
        g_ssdpSocket = null;
    }
    createMulticastSocket("239.255.255.250", 1900, function(socket) {
        g_ssdpSocket = socket;
        ssdpRecvLoop(g_ssdpSocket.socketId);
    });
    if (g_wsdSocket) {
        chrome.socket.destroy(g_wsdSocket.socketId);
        g_wsdSocket = null;
    }
    createMulticastSocket("239.255.255.250", 3702, function(socket) {
        g_wsdSocket = socket;
        wsdRecvLoop(g_wsdSocket.socketId);
    });
}

function createMulticastSocket(ip, port, callback) {
    chrome.socket.create("udp", function (socket) {
        var socketId = socket.socketId;
        chrome.socket.setMulticastTimeToLive(socketId, 31, function (result) {
            if (result != 0) {
                console.log("smttl: " + result);
            }
            chrome.socket.bind(socketId, "0.0.0.0", port, function (result) {
                console.log("bind: " + result);
                if (result == 0) {
                       chrome.socket.joinGroup(socketId, ip, function (result) {
                        if (result != 0) {
                            console.log("joinGroup: " + result);
                        } else {
                            callback(socket);
                        }
                    });             
                }
            });
        });
    });
};

var ssdpDiscoverStr = [
     'M-SEARCH * HTTP/1.1 ',
     'HOST: 239.255.255.250:1900',
     'MAN: "ssdp:discover"',
     'MX: 3',
     'ST: ssdp:all' 
    ].join('\r\n');
   
   
var g_ssdpSearchSocket;

function ssdpSearch() {
    // trigger an ssdp m-search
    var str = ssdpDiscoverStr;
    var buf = new ArrayBuffer(str.length);
    var bufView = new Uint8Array(buf);
    for (var i=0, strLen=str.length; i<strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }

    if (g_ssdpSearchSocket) {
        chrome.socket.destroy(g_ssdpSearchSocket.socketId);
        g_ssdpSearchSocket = null;
    }
    
    chrome.socket.create("udp", function (socket) {
        g_ssdpSearchSocket = socket;
        var socketId = socket.socketId;
        chrome.socket.bind(socketId, "0.0.0.0", 0, function (result) {
            chrome.socket.sendTo(socketId, buf, "239.255.255.250", 1900, function (result){
                console.log("search wrote:" + result);
                ssdpRecvLoop(socketId);
            });
        });
    });
}

function createNewUuid() {
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
    return uuid;
}

var probeStrHeader = '<?xml version="1.0" encoding="utf-8" ?>';
var probeStrBody = [
'<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:wsd="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:wsdp="http://schemas.xmlsoap.org/ws/2006/02/devprof">',
'<soap:Header>',
    '<wsa:To>',
        'urn:schemas-xmlsoap-org:ws:2005:04:discovery',
    '</wsa:To>',
    '<wsa:Action>',
        'http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe',
    '</wsa:Action>',
    '<wsa:MessageID>',
        'urn:uuid:00000000-0000-0000-0000-000000000000',
    '</wsa:MessageID>',
'</soap:Header>',
'<soap:Body>',
    '<wsd:Probe>',
        '<wsd:Types>wsdp:Device</wsd:Types>',
    '</wsd:Probe>',
'</soap:Body>',
'</soap:Envelope>'
].join('');
var probeStr = probeStrHeader + '\r\n' + probeStrBody;

var g_wsdSearchSocket;

function wsdSearch() {
    // trigger an ws-discover probe
    var uuid = createNewUuid();
    var str = probeStr.replace('00000000-0000-0000-0000-000000000000', uuid);
    var buf = new ArrayBuffer(str.length);
    var bufView = new Uint8Array(buf);
    for (var i=0, strLen=str.length; i<strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }

    if (g_wsdSearchSocket) {
        chrome.socket.destroy(g_wsdSearchSocket.socketId);
        g_wsdSearchSocket = null;
    }
    
    chrome.socket.create("udp", function (socket) {
        g_wsdSearchSocket = socket;
        var socketId = socket.socketId;
        chrome.socket.bind(socketId, "0.0.0.0", 0, function (result) {
            chrome.socket.sendTo(socketId, buf, "239.255.255.250", 3702, function (result){
                console.log("search wrote:" + result);
                wsdRecvLoop(socketId);
            });
        });
    });
}

function devicesSearch() {
    ssdpSearch();
    wsdSearch();
}

var transferGetStr = [
'<s:Envelope>',
    'xmlns:s="http://www.w3.org/2003/05/soap-envelope"',
    'xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"',
  '<s:Header>',
    '<wsa:To>uuid:11111111-1111-1111-1111-111111111111</wsa:To>',
    '<wsa:Action>',
      'http://schemas.xmlsoap.org/ws/2004/09/transfer/Get',
    '</wsa:Action>',
    '<wsa:MessageID>',
      'uuid:00000000-0000-0000-0000-000000000000',
    '</wsa:MessageID>',
  '</s:Header>',
  '<s:Body/>',
'</s:Envelope>'  
].join('\r\n');

function wsTransferGet(wsDevice) {
    var uuid = createNewUuid();
    var str = transferGetStr.replace("00000000-0000-0000-0000-000000000000", uuid);  
    // TODO - Replace the To: ?
    var xhr = new XMLHttpRequest();
    xhr.wsDevice = wsDevice;
    xhr.open("POST", wsDevice.location, true);
    xhr.setRequestHeader('Content-Type', 'application/soap+xml');
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    xhr.setRequestHeader('Pragma', 'no-cache');
    xhr.onreadystatechange = wsTransferGetRSC;
    xhr.send(str);
}

function wsTransferGetRSC(e) {
    if (this.readyState == 4) {
        if (this.status == 200) {
            var xml = this.responseXML; 
            console.log("wstgrsc: responseXML: " + xml);
            // TODO - get the friendly name, make, model etc from
            // Blocked on UDP being able to share the wsd port on windows (works on ChromeOS)
        }
    }    
}

function getWsdDeviceInfo(wsDevice) {
    wsTransferGet(wsDevice);
}