Http4GFW is a free and open source project developed by [Yeefont](http://www.yeefont.com). It aims to make web traffic pass through some sensitive firewall in internet.
Thanks to **socket.io** , the task on HTTP-traffic is much simpler now.

# How It Works #
 
![System Architecture of Http4gfw](http://www.yeeads.com/img/github/node4gfw.jpg)

# Config & Run #
1. upload the project to Http-Host Server supporting Node.js, **app.js** is the  start script.
2. in local machine, run SOCKS5 script **localA.js** 
3. in local machine, run DNS-Server Script **localB.js**
4. in local machine, set Browser's SOCKS5 proxy address(default is *127.0.0.1:8888*, set interface's DNS-Server address(default is *127.0.0.1*)

Please modify **config.js** according to your environment.


# Debug #
You can run the proxy-server in local machine.

----------

# Issues #
1. the speed is much slower than normal VPN
2. it is just an experimental project, must have many bugs.



