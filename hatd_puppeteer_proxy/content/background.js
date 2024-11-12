
class Authentication {
  static {
    this.data = {};
    this.pending = {};
    const urls = ['*://*/*'];
    chrome.webRequest.onAuthRequired.addListener(e => this.process(e), { urls }, ['blocking']);
    chrome.webRequest.onCompleted.addListener(e => this.clearPending(e), { urls });
    chrome.webRequest.onErrorOccurred.addListener(e => this.clearPending(e), { urls });
  }

  static init(user_pass) {
    this.data = {};
    if (user_pass) {
      let [username, password] = user_pass.split(":")
      this.data = { username: username, password: password };
    }
  }

  static process(e) {
    if (!e.isProxy) { return; }
    if (this.pending[e.requestId]) { return { cancel: true }; }

    const authCredentials = this.data
    if (authCredentials) {
      this.pending[e.requestId] = 1;
      return { authCredentials };
    }
  }

  static clearPending(e) {
    delete this.pending[e.requestId];
  }
}

chrome.runtime.onMessageExternal.addListener(
  function (request, sender, sendResponse) {
    console.log(request)
    const proxy_url = request.proxy_url
    if (!proxy_url || proxy_url == '') {
      chrome.proxy.settings.clear({})
      chrome.proxy.settings.get(
        { 'incognito': false },
        function (config) {
          console.log(JSON.stringify(config));
        }
      );
      return
    }
    let [scheme, user_pass_ip_port] = proxy_url.split("//")
    scheme = scheme.replace(":", "")
    let user_pass, ip_port
    if (user_pass_ip_port.includes("@")) {
      [user_pass, ip_port] = user_pass_ip_port.split("@")
    } else {
      ip_port = user_pass_ip_port
    }
    let [host, port] = ip_port.split(":")
    const config = {
      "value": {
        "mode": "fixed_servers",
        "rules": {
          "singleProxy": {
            "scheme": scheme,
            "host": host,
            "port": parseInt(port)
          }
        }
      },
      "scope": "regular"
    }
    chrome.proxy.settings.get(
      { 'incognito': false },
      function (config) {
        console.log(JSON.stringify(config));
      }
    );

    chrome.proxy.settings.set(config);
    Authentication.init(user_pass)
  });