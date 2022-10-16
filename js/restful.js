const xhr = function(method, url, data={}, query={}, headers={}) {
  //headers['User-Agent'] = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36";
  return new Promise((resolve, reject) => {
    var xhttp = new XMLHttpRequest({ mozSystem: true });
    var _url = new URL(url);
    for (var y in query) {
      _url.searchParams.set(y, query[y]);
    }
    if (Object.keys(query).length > 0)
      url = _url.origin + _url.pathname + '?' + _url.searchParams.toString();
    else
      url = _url.origin + _url.pathname;
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4) {
        if (this.status >= 200 && this.status <= 399) {
          try {
            const response = JSON.parse(xhttp.response);
            resolve({ raw: xhttp, response: response});
          } catch (e) {
            resolve({ raw: xhttp, response: xhttp.responseText});
          }
        } else {
          try {
            const response = JSON.parse(xhttp.response);
            reject({ raw: xhttp, response: response});
          } catch (e) {
            reject({ raw: xhttp, response: xhttp.responseText});
          }
        }
      }
    };
    xhttp.open(method, url, true);
    for (var x in headers) {
      xhttp.setRequestHeader(x, headers[x]);
    }
    if (Object.keys(data).length > 0) {
      xhttp.send(JSON.stringify(data));
    } else {
      xhttp.send();
    }
  });
}

const getHeaders = function() {
  var apiKey = localStorage.getItem(KEY);
  var apiSecret = localStorage.getItem(SECRET);
  const unixTime= parseInt(new Date().getTime() / 1000);
  return {
    "User-Agent": "KaiOS",
    "X-Auth-Key": apiKey.toString(),
    "X-Auth-Date": unixTime.toString(),
    "Authorization": sha1(apiKey.toString() + apiSecret.toString() + unixTime.toString()).toString()
  };
}

const podcastIndex = {
  prepUrl: function(baseUrl, url, query = {}, headers = {}, force = false) {
    if ((localStorage.getItem(KEY) == null || localStorage.getItem(SECRET) == null) || force) {
      query = {
        url: btoa(url),
        query: btoa(JSON.stringify(query)),
        header: btoa(JSON.stringify(headers))
      }
      url = baseUrl;
      headers = {};
    } else {
      headers = getHeaders();
    }
    return { url, query, headers };
  },
  makeRss: function(url, query = {}, headers = {}) {
    var base = 'https://malaysiaapi-arma7x.koyeb.app/podcastindex/v1/content-proxy';
    return this.prepUrl(base, url, query, headers, true);
  },
  makeUrl: function(url, query = {}, headers = {}) {
    var base = 'https://malaysiaapi-arma7x.koyeb.app/podcastindex/v1/proxy';
    return this.prepUrl(base, url, query, headers, false);
  },
  getCategories: function() {
    const obj = this.makeUrl('https://api.podcastindex.org/api/1.0/categories/list', {});
    return xhr('GET', obj.url, {}, obj.query, obj.headers);
  },
  getTrending: function() {
    const obj = this.makeUrl('https://api.podcastindex.org/api/1.0/podcasts/trending', {});
    return xhr('GET', obj.url, {}, obj.query, obj.headers);
  },
  getRecentFeeds: function(categories = []) {
    const params = {};
    if (categories.length > 0)
      params['cat'] = categories.join(',');
    const obj = this.makeUrl('https://api.podcastindex.org/api/1.0/recent/feeds', params);
    return xhr('GET', obj.url, {}, obj.query, obj.headers);
  },
  getRecentEpisodes: function() {
    const obj = this.makeUrl('https://api.podcastindex.org/api/1.0/recent/episodes', {});
    return xhr('GET', obj.url, {}, obj.query, obj.headers);
  },
  getRandomEpisodes: function(max = 40) {
    const obj = this.makeUrl('https://api.podcastindex.org/api/1.0/episodes/random', {max});
    return xhr('GET', obj.url, {}, obj.query, obj.headers);
  },
  searchByTerm: function(q) {
    const obj = this.makeUrl('https://api.podcastindex.org/api/1.0/search/byterm', {q});
    return xhr('GET', obj.url, {}, obj.query, obj.headers);
  },
  searchByTitle: function(q) {
    const obj = this.makeUrl('https://api.podcastindex.org/api/1.0/search/bytitle', {q});
    return xhr('GET', obj.url, {}, obj.query, obj.headers);
  },
  searchByPerson: function(q) {
    const obj = this.makeUrl('https://api.podcastindex.org/api/1.0/search/byperson', {q});
    return xhr('GET', obj.url, {}, obj.query, obj.headers);
  },
  getFeed: function(id) {
    const obj = this.makeUrl('https://api.podcastindex.org/api/1.0/podcasts/byfeedid', {id});
    return xhr('GET', obj.url, {}, obj.query, obj.headers);
  },
  getFeedEpisodes: function(id) {
    const obj = this.makeUrl('https://api.podcastindex.org/api/1.0/episodes/byfeedid', {id});
    return xhr('GET', obj.url, {}, obj.query, obj.headers);
  },
}
