var APP_STATE = false;
const APP_VERSION = '1.0.0';
const KEY = 'PODCASTINDEX_KEY';
const SECRET = 'PODCASTINDEX_SECRET';
const DB_NAME = 'PODKAST';
const TABLE_PODCASTS = 'PODCASTS';
const TABLE_SUBSCRIBED = 'SUBSCRIBED_PODCASTS'; // [feedId, feedId, feedId, feedId, ...]
const TABLE_EPISODES = 'PODCAST_EPISODES';
const TABLE_BOOKMARKED = 'BOOKMARKED_EPISODES';
const TABLE_APP_STATE = 'APP_STATE';
const CATEGORIES = 'CATEGORIES';
const EP_STATES = [TABLE_BOOKMARKED];

const convertTime = function(time) {
  if (isNaN(time)) {
    return "00:00";
  }
  var hours = "";
  var mins = Math.floor(time / 60);
  if (mins > 59) {
    var hr = Math.floor(mins / 60);
    mins = Math.floor(mins - Number(60 * hr));
    hours = hr;
  }
  if (hours != "") {
    if (hours < 10) {
      hours = "0" + String(hours) + ":";
    } else {
      hours = hours + ":";
    }
  }
  if (mins < 10) {
    mins = "0" + String(mins);
  }
  var secs = Math.floor(time % 60);
  if (secs < 10) {
    secs = "0" + String(secs);
  }
  return hours + mins + ":" + secs;
}

const pushLocalNotification = function(title, body) {
  window.Notification.requestPermission()
  .then((result) => {
    var notification = new window.Notification(title, {
      body: body,
      requireInteraction: true
    });
    notification.onerror = function(err) {
      console.log(err);
    }
    notification.onclick = function(event) {
      if (window.navigator.mozApps) {
        var request = window.navigator.mozApps.getSelf();
        request.onsuccess = function() {
          if (request.result) {
            notification.close();
            request.result.launch();
          }
        };
      } else {
        window.open(document.location.origin, '_blank');
      }
    }
    notification.onshow = function() {
      // notification.close();
    }
  });
}

const xhr = function(method, url, data={}, query={}, headers={}) {
  //headers['User-Agent'] = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36";
  return new Promise((resolve, reject) => {
    var xhttp = new XMLHttpRequest({ mozSystem: true });
    var _url = new URL(url);
    for (var y in query) {
      _url.searchParams.set(y, query[y]);
    }
    url = _url.origin + _url.pathname + '?' + _url.searchParams.toString();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4) {
        if (this.status >= 200 && this.status <= 299) {
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
    "User-Agent": "KaiOS PodKast",
    "X-Auth-Key": apiKey.toString(),
    "X-Auth-Date": unixTime.toString(),
    "Authorization": sha1(apiKey.toString() + apiSecret.toString() + unixTime.toString()).toString()
  };
}

const podcastIndex = {
  makeUrl: function(url, query = {}) {
    var headers = {};
    if (localStorage.getItem(KEY) == null || localStorage.getItem(SECRET) == null) {
      query = {
        url: btoa(url),
        query: btoa(JSON.stringify(query))
      }
      url = 'https://malaysiaapi.herokuapp.com/podcastindex/v1/proxy';
    } else {
      headers = getHeaders();
    }
    return { url, query, headers };
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

const renderImg = function(id, src) {
  var img = document.getElementById(id);
  img.crossOrigin = 'anonymous';
  img.src = src;
}

const resizeImage = function(id, url, cb) {
  var img = new Image();
  img.crossOrigin = 'Anonymous';
  img.src = url;
  img.onload = function() {
    var elem = document.createElement('canvas');
    var scale = 4;
    elem.width = img.naturalWidth / scale;
    elem.height = img.naturalHeight / scale;
    var ctx = elem.getContext('2d');
    ctx.drawImage(img, 0, 0, elem.width, elem.height);
    if (cb != undefined && typeof cb == 'function') {
      cb(id, ctx.canvas.toDataURL('image/png', 100));
    }
    console.log('Success', id, url);
  }
  img.onerror = function(e) {
    if (cb != undefined && typeof cb == 'function') {
      cb(id, url);
    }
    console.log('Fail', id, url);
  }
}

window.addEventListener("load", () => {

  const DEFAULT_VOLUME = 0.02;

  const MAIN_PLAYER = document.createElement("audio");
  MAIN_PLAYER.volume = 1;
  MAIN_PLAYER.mozAudioChannelType = 'content';

  const MINI_PLAYER = document.createElement("audio");
  MINI_PLAYER.volume = 1;
  MINI_PLAYER.mozAudioChannelType = 'content';

  // trigger permission for device storage
  (navigator.b2g ? navigator.b2g.getDeviceStorages('sdcard') : navigator.getDeviceStorages('sdcard'))[0].get('trigger_permission');

  // START polyfill audio volume manager
  if (navigator.mozAudioChannelManager) {
    navigator.mozAudioChannelManager.volumeControlChannel = 'content';
  }

  function startVolumeManager() {
    const session = new lib_session.Session();
    const sessionstate = {};
    navigator.volumeManager = null;
    sessionstate.onsessionconnected = function () {
      lib_audiovolume.AudioVolumeManager.get(session).
      then((AudioVolumeManagerService) => {
        navigator.volumeManager = AudioVolumeManagerService;
      }).catch((e) => {
        navigator.volumeManager = null;
      });
    };
    sessionstate.onsessiondisconnected = function () {
      startVolumeManager();
    };
    session.open('websocket', 'localhost:8081', 'secrettoken', sessionstate, true);
  }

  (() => {
    if (navigator.b2g) {
      const head = document.getElementsByTagName('head')[0];
      const scripts = ["http://127.0.0.1:8081/api/v1/shared/core.js", "http://127.0.0.1:8081/api/v1/shared/session.js", "http://127.0.0.1:8081/api/v1/audiovolumemanager/service.js"];
      scripts.forEach((path) => {
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = path;
        head.appendChild(script);
      });
      setTimeout(startVolumeManager, 1000);
    }
  })();

  function volumeDown(player) {
    if (navigator.b2g) {
      if (navigator.b2g.audioChannelManager && navigator.volumeManager) {
        navigator.volumeManager.requestVolumeDown();
      } else {
        if (player.volume > 0) {
          player.volume = parseFloat((player.volume - DEFAULT_VOLUME).toFixed(2));
        }
      }
    } else if (navigator.mozAudioChannelManager) {
      navigator.volumeManager.requestDown();
    } else {
      if (player.volume > 0) {
        player.volume = parseFloat((player.volume - DEFAULT_VOLUME).toFixed(2));
      }
    }
  }

  function volumeUp(player) {
    if (navigator.b2g) {
      if (navigator.b2g.audioChannelManager && navigator.volumeManager) {
        navigator.volumeManager.requestVolumeUp();
      } else {
        if (player.volume < 1) {
          player.volume = parseFloat((player.volume + DEFAULT_VOLUME).toFixed(2));
        }
      }
    } else if (navigator.mozAudioChannelManager) {
      navigator.volumeManager.requestUp();
    } else {
      if (player.volume < 1) {
        player.volume = parseFloat((player.volume + DEFAULT_VOLUME).toFixed(2));
      }
    }
  }
  // END polyfill audio volume manager

  localforage.setDriver(localforage.INDEXEDDB);

  // {feedId:meta}
  const T_PODCASTS = localforage.createInstance({
    name: DB_NAME,
    storeName: TABLE_PODCASTS
  });

  // {feedId:{episodeId:meta}
  const T_EPISODES = localforage.createInstance({
    name: DB_NAME,
    storeName: TABLE_EPISODES
  });

  // {feedId:[episodeId]}
  const T_BOOKMARKED = localforage.createInstance({
    name: DB_NAME,
    storeName: TABLE_BOOKMARKED
  });

  // autoplay, current_podcast(feedId)
  const T_APP_STATE = localforage.createInstance({
    name: DB_NAME,
    storeName: TABLE_APP_STATE
  });

  const state = new KaiState({
    [CATEGORIES]: [],
    [TABLE_BOOKMARKED]: {},
  });

  const initTableBookmarked = function() {
    const temps = {};
    T_BOOKMARKED.iterate((value, key, iterationNumber) => {
      temps[key] = value;
    })
    .then(() => {
      // console.log('initTableBookmarked', TABLE_BOOKMARKED, temps);
      state.setState(TABLE_BOOKMARKED, temps);
    })
    .catch((err) =>{
      console.log(err);
    });
  }
  initTableBookmarked();

  const addBookmark = function($router, episode) {
    delete episode['podkastBookmark'];
    playEpisode($router, episode, false)
    .then(() => {
      return T_BOOKMARKED.getItem(episode['feedId'].toString());
    })
    .then((episodes) => {
      if (episodes == null) {
        episodes = [];
      }
      episodes.push(episode['id']);
      return T_BOOKMARKED.setItem(episode['feedId'].toString(), episodes);
    })
    .then(() => {
      $router.showToast('DONE BOOKMARK');
      initTableBookmarked();
    })
    .catch((err) => {
      $router.showToast('FAIL');
    });
  }

  const removeBookmark = function($router, episode) {
    T_BOOKMARKED.getItem(episode['feedId'].toString())
    .then((episodes) => {
      if (episodes == null) {
        episodes = [];
      }
      if (episodes.indexOf(episode['id']) > -1) {
        episodes.splice(episodes.indexOf(episode['id']), 1);
      }
      if (episodes.length === 0)
        return T_BOOKMARKED.removeItem(episode['feedId'].toString());
      return T_BOOKMARKED.setItem(episode['feedId'].toString(), episodes);
    })
    .then(() => {
      $router.showToast('DONE REMOVE BOOKMARK');
      initTableBookmarked();
    })
    .catch((err) => {
      $router.showToast('FAIL');
    });
  }

  const initCategories = function() {
    podcastIndex.getCategories()
    .then((result) => {
      if (Object.keys(result.response.feeds).length > 0) {
        const temp = [];
        for (var x in result.response.feeds) {
          result.response.feeds[x]['text'] = result.response.feeds[x]['name'];
          result.response.feeds[x]['checked'] = false;
          temp.push(result.response.feeds[x]);
        }
        state.setState('CATEGORIES', temp);
      }
    })
    .catch((err) => {
      console.log(err);
    })
  }
  initCategories();

  const listenPodcast = function(id, $router, playable = true) {
    $router.showLoading();
    Promise.all([podcastIndex.getFeed(id), T_PODCASTS.getItem(id.toString()), podcastIndex.getFeedEpisodes(id), T_EPISODES.getItem(id.toString())])
    .then((results) => {
      var tempPodcast = results[1];
      if (tempPodcast == null) {
        console.log('Podcast !Cached:', id);
        tempPodcast = {};
        tempPodcast['podkastCurrentEpisode'] = results[2].response.items[results[2].response.items.length - 1]['id'];
      }
      tempPodcast = Object.assign(tempPodcast, results[0].response.feed);
      var tempEpisodes = results[3];
      if (tempEpisodes == null) {
        tempEpisodes = {};
      }
      results[2].response.items.forEach((epsd) => {
        if (tempEpisodes[epsd['id']] == null) { // !CACHE
          console.log('Podcast Ep !Cached:', id, epsd['id']);
          tempEpisodes[epsd['id']] = {};
          tempEpisodes[epsd['id']]['podkastLocalPath'] = false;
          tempEpisodes[epsd['id']]['podkastLastDuration'] = 0;
        }
        tempEpisodes[epsd['id']] = Object.assign(tempEpisodes[epsd['id']], epsd);
      });
      return Promise.all([T_PODCASTS.setItem(id.toString(), tempPodcast), T_EPISODES.setItem(id.toString(), tempEpisodes)]);
    })
    .then((saved) => {
      console.log(saved);
      console.log(saved[1][saved[0]['podkastCurrentEpisode']]);
      // MAIN_PLAYER
      // T_PODCASTS.removeItem(id.toString());
      // T_EPISODES.removeItem(id.toString());
    })
    .catch((err) => {
      console.log(err);
    })
    .finally(() => {
      $router.hideLoading();
    });
  }

  const playEpisode = function($router, episode, playable = true) {
    delete episode['podkastBookmark'];
    return T_EPISODES.getItem(episode['feedId'].toString())
    .then((episodesObj) => {
      if (episodesObj == null) {
        episodesObj = {};
      }
      var tempEpisode = episodesObj[episode['id']];
      if (tempEpisode == null) { // !CACHE
        console.log('Podcast Ep !Cached:', episode['feedId'], episode['id']);
        tempEpisode = {};
        tempEpisode['podkastLocalPath'] = false;
        tempEpisode['podkastLastDuration'] = 0;
      }
      tempEpisode = Object.assign(tempEpisode, episode);
      episodesObj[episode['id']] = tempEpisode;
      T_EPISODES.setItem(episode['feedId'].toString(), episodesObj);
      if (playable)
        miniPlayer(router, episodesObj[episode['id']]);
      // console.log(episodesObj,  episodesObj[episode['id']]);
      return Promise.resolve(episodesObj[episode['id']]);
    })
    .catch((err) => {
      miniPlayer(router, episode);
      // console.log(err);
      return Promise.reject(err);
    });
  }

  const changelogs = new Kai({
    name: 'changelogs',
    data: {
      title: 'changelogs'
    },
    templateUrl: document.location.origin + '/templates/changelogs.html',
    mounted: function() {
      this.$router.setHeaderTitle('Changelogs');
    },
    unmounted: function() {},
    methods: {},
    softKeyText: { left: '', center: '', right: '' },
    softKeyListener: {
      left: function() {},
      center: function() {},
      right: function() {}
    }
  });

  const helpSupport = new Kai({
    name: 'helpSupport',
    data: {
      title: 'helpSupport',
      list: [
        {
          'question': 'Which sorting/aggregations timeframe available for Logs & Reports ?',
          'answer': `- Daily<br>- Weekly<br>- Monthly<br>- Yearly<br>- Entire Logs<br>- Advanced`,
        },
      ]
    },
    verticalNavClass: '.helpSupportNav',
    templateUrl: document.location.origin + '/templates/helpSupport.html',
    mounted: function() {
      this.$router.setHeaderTitle('Help & Support');
    },
    unmounted: function() {},
    methods: {},
    softKeyText: { left: '', center: 'SELECT', right: '' },
    softKeyListener: {
      left: function() {},
      center: function() {
        const t = this.data.list[this.verticalNavIndex];
        if (t != null) {
          this.$router.showDialog('Answer', t['answer'], null, 'Close', undefined, ' ', undefined, undefined, undefined, () => {});
        }
      },
      right: function() {}
    },
    dPadNavListener: {
      arrowUp: function() {
        if (this.verticalNavIndex <= 0)
          return;
        this.navigateListNav(-1);
      },
      arrowDown: function() {
        const listNav = document.querySelectorAll(this.verticalNavClass);
        if (this.verticalNavIndex === listNav.length - 1)
          return
        this.navigateListNav(1);
      }
    }
  });

  const miniPlayer = function($router, episode) {
    // feedTitle title enclosureUrl
    // console.log(episode);
    var DURATION_SLIDER, CURRENT_TIME, DURATION;
    $router.showBottomSheet(
      new Kai({
        name: 'miniPlayer',
        data: {
          title: 'miniPlayer',
          episode: episode,
        },
        templateUrl: document.location.origin + '/templates/miniPlayer.html',
        softKeyText: { left: 'Exit', center: '', right: '' },
        softKeyListener: {
          left: function() {
            $router.hideBottomSheet();
          },
          center: function() {
            if (MINI_PLAYER.duration > 0 && !MINI_PLAYER.paused) {
              MINI_PLAYER.pause();
            } else {
              MINI_PLAYER.play();
            }
          },
          right: function() {}
        },
        mounted: function() {
          setTimeout(() => {
            DURATION_SLIDER = document.getElementById('mini_duration_slider');
            CURRENT_TIME = document.getElementById('mini_current_time');
            DURATION = document.getElementById('mini_duration');
            MINI_PLAYER.addEventListener('loadedmetadata', this.methods.onloadedmetadata);
            MINI_PLAYER.addEventListener('timeupdate', this.methods.ontimeupdate);
            MINI_PLAYER.addEventListener('pause', this.methods.onpause);
            MINI_PLAYER.addEventListener('play', this.methods.onplay);
            MINI_PLAYER.src = episode['enclosureUrl'];
            MINI_PLAYER.play();
          }, 100);
        },
        unmounted: function() {
          MINI_PLAYER.removeEventListener('loadedmetadata', this.methods.onloadedmetadata);
          MINI_PLAYER.removeEventListener('timeupdate', this.methods.ontimeupdate);
          MINI_PLAYER.removeEventListener('pause', this.methods.onpause);
          MINI_PLAYER.removeEventListener('play', this.methods.onplay);
          MINI_PLAYER.src = '';
          MINI_PLAYER.pause();
          MINI_PLAYER.currentTime = 0;
        },
        methods: {
          onloadedmetadata: function(evt) {
            var duration = evt.target.duration;
            DURATION.innerHTML = convertTime(evt.target.duration);
            DURATION_SLIDER.setAttribute("max", duration);
          },
          ontimeupdate: function(evt) {
            var currentTime = evt.target.currentTime;
            CURRENT_TIME.innerHTML = convertTime(evt.target.currentTime);
            DURATION_SLIDER.value = currentTime;
          },
          onpause: function() {
            $router.setSoftKeyCenterText('PLAY');
          },
          onplay: function() {
            $router.setSoftKeyCenterText('PAUSE');
          }
        },
        dPadNavListener: {
          arrowUp: function() {
            volumeUp(MINI_PLAYER);
          },
          arrowRight: function() {
            // fast-forward
          },
          arrowDown: function() {
            volumeDown(MINI_PLAYER);
          },
          arrowLeft: function() {
            // rewind
          },
        },
        backKeyListener: function(evt) {
          return -1;
        }
      })
    );
  }

  const episodePage = function($router, title, data = null, rightSoftKeyCallback = {}) {
    $router.push(
      new Kai({
        name: 'episodePage',
        data: {
          title: 'episodePage',
          list: [],
        },
        verticalNavClass: '.ePageNav',
        templateUrl: document.location.origin + '/templates/episodePage.html',
        mounted: function() {
          this.$router.setHeaderTitle(title);
          const bookmarkList = state.getState(TABLE_BOOKMARKED);
          if (data == null) {
            this.methods.processDataNull(bookmarkList);
          } else {
            this.methods.processData(bookmarkList);
          }
          state.addStateListener(TABLE_BOOKMARKED, this.methods.listenState);
        },
        unmounted: function() {
          state.removeStateListener(TABLE_BOOKMARKED, this.methods.listenState);
        },
        methods: {
          listenState: function(updated) {
            // console.log('listenState', TABLE_BOOKMARKED, updated);
            if (data == null) {
              this.methods.processDataNull(updated);
            } else {
              this.methods.processData(updated);
            }
          },
          processData: function(bookmarkList) {
            // console.log('processData', TABLE_BOOKMARKED, bookmarkList);
            data.forEach((i) => {
              i['podkastBookmark'] = false;
              if (i['feedImage'] == '' || i['feedImage'] == null)
                i['feedImage'] = '/icons/icon112x112.png';
              if (i['image'] == '' || i['image'] == null)
                i['image'] = i['feedImage'];
              if (bookmarkList[i['feedId']] != null) {
                if (bookmarkList[i['feedId']].indexOf(i['id']) > -1)
                  i['podkastBookmark'] = true;
              }
            });
            this.setData({ list: data });
            this.methods.trimTitle();
          },
          processDataNull: function(bookmarkList) {
            if (Object.keys(bookmarkList).length === 0) {
              this.setData({ list: [] });
              return;
            }
            var temp = [];
            var bookmarkSize = 0;
            for (var feedId in bookmarkList) {
              bookmarkSize += bookmarkList[feedId].length;
            }
            for (var feedId in bookmarkList) {
              const cur = feedId;
              T_EPISODES.getItem(feedId)
              .then((episodes) => {
                bookmarkList[cur].forEach((id) => {
                  if (episodes[id]) {
                    if (episodes[id]['feedImage'] == '' || episodes[id]['feedImage'] == null)
                      episodes[id]['feedImage'] = '/icons/icon112x112.png';
                    if (episodes[id]['image'] == '' || episodes[id]['image'] == null)
                      episodes[id]['image'] = episodes[id]['feedImage'];
                    episodes[id]['podkastBookmark'] = true;
                    temp.push(episodes[id]);
                  }
                  bookmarkSize--;
                  if (bookmarkSize <= 0) {
                    if (temp.length < this.verticalNavIndex + 1) {
                      this.verticalNavIndex--;
                    }
                    this.setData({ list: temp });
                    this.methods.trimTitle();
                  }
                });
              });
            }
          },
          trimTitle: function() {
            setTimeout(() => {
              this.data.list.forEach((l) => {
                const t = document.getElementById(`title_${l.feedId}_${l.id}`);
                if (t != null) {
                  if (t.textContent.length >= 80) {
                    t.textContent = t.textContent.slice(0, 77) + '...';
                  }
                }
              });
            }, 500);
          }
        },
        softKeyText: { left: 'Info', center: 'PLAY', right: 'More' },
        softKeyListener: {
          left: function() {
            if (this.data.list[this.verticalNavIndex] == null)
              return;
            console.log(this.data.list[this.verticalNavIndex]);
          },
          center: function() {
            if (this.data.list[this.verticalNavIndex] == null)
              return;
            playEpisode($router, JSON.parse(JSON.stringify(this.data.list[this.verticalNavIndex])));
          },
          right: function() {
            if (this.data.list[this.verticalNavIndex] == null)
              return;
            const menu = [];
            if (data !== null) {
              if (this.data.list[this.verticalNavIndex]['podkastBookmark'] === false)
                menu.push({ 'text': 'Add Bookmark' });
            }
            if (this.data.list[this.verticalNavIndex]['podkastBookmark'])
              menu.push({ 'text': 'Remove Bookmark' });
            for (var k in rightSoftKeyCallback) {
              menu.push({ 'text': k });
            }
            this.$router.showOptionMenu('More', menu, 'SELECT', (selected) => {
              if (rightSoftKeyCallback[selected.text]) {
                rightSoftKeyCallback[selected.text](JSON.parse(JSON.stringify(this.data.list[this.verticalNavIndex])));
              } else if (selected.text === 'Add Bookmark') {
                addBookmark($router, JSON.parse(JSON.stringify(this.data.list[this.verticalNavIndex])));
              } else if (selected.text === 'Remove Bookmark') {
                removeBookmark($router, JSON.parse(JSON.stringify(this.data.list[this.verticalNavIndex])));
              }
            }, () => {});
          }
        },
        dPadNavListener: {
          arrowUp: function() {
            if (this.verticalNavIndex <= 0)
              return;
            this.navigateListNav(-1);
          },
          arrowDown: function() {
            const listNav = document.querySelectorAll(this.verticalNavClass);
            if (this.verticalNavIndex === listNav.length - 1)
              return
            this.navigateListNav(1);
          }
        }
      })
    );
  }

  const podcastPage = function($router, title, data = null) {
    console.log(title, data);
  }

  const home = new Kai({
    name: 'home',
    data: {
      title: 'PodKast',
      album_art: '/icons/icon112x112.png',
      play_icon: '/icons/play.png',
      slider_value: 0,
      slider_max: 100,
      current_time: '00:00',
      duration: '00:00',
    },
    // verticalNavClass: '.homeNav',
    components: [],
    templateUrl: document.location.origin + '/templates/home.html',
    mounted: function() {
      this.$router.setHeaderTitle('PodKast');
      const CURRENT_VERSION = window.localStorage.getItem('APP_VERSION');
      if (APP_VERSION != CURRENT_VERSION) {
        this.$router.showToast(`Updated to version ${APP_VERSION}`);
        this.$router.push('changelogs');
        window.localStorage.setItem('APP_VERSION', APP_VERSION);
        return;
      }
      APP_STATE = true;
    },
    unmounted: function() {},
    methods: {
      showInputDialog: function(title, placeholder, cb = () => {}) {
        const searchDialog = Kai.createDialog(title, `<div><input id="keyword-input" type="text" placeholder="${placeholder}" class="kui-input"/></div>`, null, '', undefined, '', undefined, '', undefined, undefined, this.$router);
        searchDialog.mounted = () => {
          setTimeout(() => {
            setTimeout(() => {
              this.$router.setSoftKeyText('Cancel' , '', 'Go');
            }, 103);
            const KEYWORD = document.getElementById('keyword-input');
            if (!KEYWORD) {
              return;
            }
            KEYWORD.focus();
            KEYWORD.value = '';
            KEYWORD.addEventListener('keydown', (evt) => {
              switch (evt.key) {
                case 'Backspace':
                case 'EndCall':
                  if (document.activeElement.value.length === 0) {
                    this.$router.hideBottomSheet();
                    setTimeout(() => {
                      KEYWORD.blur();
                    }, 100);
                  }
                  break
                case 'SoftRight':
                  setTimeout(() => {
                    KEYWORD.blur();
                    if (KEYWORD.value.trim() != '' && KEYWORD.value.trim().length > 0)
                      cb(KEYWORD.value.trim());
                    this.$router.hideBottomSheet();
                  }, 100);
                  break
                case 'SoftLeft':
                  setTimeout(() => {
                    KEYWORD.blur();
                    this.$router.hideBottomSheet();
                  }, 100);
                  break
              }
            });
          });
        }
        searchDialog.dPadNavListener = {
          arrowUp: function() {
            const KEYWORD = document.getElementById('keyword-input');
            KEYWORD.focus();
          },
          arrowDown: function() {
            const KEYWORD = document.getElementById('keyword-input');
            KEYWORD.focus();
          }
        }
        this.$router.showBottomSheet(searchDialog);
      }
    },
    softKeyText: { left: 'Episodes', center: '', right: 'Menu' },
    softKeyListener: {
      left: function() {},
      center: function() {},
      right: function() {
        var menu = [
          {'text': 'Test'},
          {'text': 'Subscribed Podcasts'},
          {'text': 'Search Podcast'},
          {'text': 'Trending Podcast'},
          {'text': 'Recent Podcast'},
          {'text': 'Recent Podcast By Category'},
          {'text': 'Bookmarked Episodes'},
          {'text': 'Random Episodes'},
          {'text': 'Help & Support'},
          {'text': 'Changelogs'},
          {'text': 'Exit'},
        ]
        this.$router.showOptionMenu('Menu', menu, 'SELECT', (selected) => {
          switch (selected.text) {
            case 'Test':
              listenPodcast(75075, this.$router);
              break;
            case 'Subscribed Podcasts':
              podcastPage(this.$router, selected.text, null);
              break;
            case 'Search Podcast':
              setTimeout(() => {
                const menu = [{'text': 'Search Podcasts'}, {'text': 'Search Podcasts by Title'}, {'text': 'Search Episodes by Person'}];
                this.$router.showOptionMenu('Search', menu, 'SELECT', (selected) => {
                  switch (selected.text) {
                    case 'Search Podcasts':
                      this.methods.showInputDialog(selected.text, 'Enter search term', (term) => {
                        this.$router.showLoading();
                        podcastIndex.searchByTerm(term)
                        .then((result) => {
                          podcastPage(this.$router, selected.text, result.response.feeds);
                        })
                        .catch((err) => {
                          console.log(err);
                        })
                        .finally(() => {
                          this.$router.hideLoading();
                        });
                      });
                      break;
                    case 'Search Podcasts by Title':
                      this.methods.showInputDialog(selected.text, 'Enter search term', (term) => {
                        this.$router.showLoading();
                        podcastIndex.searchByTitle(term)
                        .then((result) => {
                          podcastPage(this.$router, selected.text, result.response.feeds);
                        })
                        .catch((err) => {
                          console.log(err);
                        })
                        .finally(() => {
                          this.$router.hideLoading();
                        });
                      });
                      break;
                    case 'Search Episodes by Person':
                      this.methods.showInputDialog(selected.text, 'Enter person name', (term) => {
                        this.$router.showLoading();
                        podcastIndex.searchByPerson(term)
                        .then((result) => {
                          episodePage(this.$router, selected.text, result.response.items, {
                            'Download': function(episode) {
                              console.log(selected.text, 'Download', episode);
                            },
                            'Podcast Info': function(episode) {
                              console.log(selected.text, 'Podcast Info', episode);
                            }
                          });
                        })
                        .catch((err) => {
                          console.log(err);
                        })
                        .finally(() => {
                          this.$router.hideLoading();
                        });
                      });
                      break;
                  }
                }, () => {});
              }, 100);
              break;
            case 'Trending Podcast':
              this.$router.showLoading();
              podcastIndex.getTrending()
              .then((result) => {
                podcastPage(this.$router, selected.text, result.response.feeds);
              })
              .catch((err) => {
                console.log(err);
              })
              .finally(() => {
                this.$router.hideLoading();
              });
              break;
            case 'Recent Podcast':
              setTimeout(() => {
                this.$router.showOptionMenu('Filter Recent Podcast By', [{'text': 'Show All'}, {'text': 'Categories'}], 'SELECT', (selected) => {
                  switch (selected.text) {
                    case 'Show All':
                      this.$router.showLoading();
                      podcastIndex.getRecentFeeds([])
                      .then((result) => {
                        podcastPage(this.$router, "Recent Podcast", result.response.feeds);
                      })
                      .catch((err) => {
                        console.log(err);
                      })
                      .finally(() => {
                        this.$router.hideLoading();
                      });
                      break;
                    case 'Categories':
                      setTimeout(() => {
                        this.$router.showMultiSelector('Categories', this.$state.getState('CATEGORIES'), 'Select', null, 'Continue', (cats) => {
                          const temp = [];
                          cats.forEach((c) => {
                            if (c['checked'])
                              temp.push(c['name']);
                          });
                          this.$router.showLoading();
                          podcastIndex.getRecentFeeds(temp)
                          .then((result) => {
                            podcastPage(this.$router, "Recent Podcast", result.response.feeds);
                          })
                          .catch((err) => {
                            console.log(err);
                          })
                          .finally(() => {
                            this.$router.hideLoading();
                          });
                        }, 'Cancel', null, () => {}, 0);
                      }, 100);
                      break;
                  }
                }, () => {});
              }, 100);
              break;
            case 'Recent Podcast By Category':
              this.$router.showOptionMenu('Categories', this.$state.getState('CATEGORIES'), 'SELECT', (selected) => {
                this.$router.showLoading();
                podcastIndex.getRecentFeeds([selected.text])
                .then((result) => {
                  podcastPage(this.$router, selected.text, result.response.feeds);
                })
                .catch((err) => {
                  console.log(err);
                })
                .finally(() => {
                  this.$router.hideLoading();
                });
              }, () => {});
              break;
            case 'Bookmarked Episodes':
              episodePage(this.$router, selected.text, null, {
                'Download': function(episode) {
                  console.log(selected.text, 'Download', episode);
                },
                'Podcast Info': function(episode) {
                  console.log(selected.text, 'Podcast Info', episode);
                }
              });
              break;
            case 'Random Episodes':
              this.$router.showLoading();
              podcastIndex.getRandomEpisodes()
              .then((result) => {
                episodePage(this.$router, selected.text, result.response.episodes, {
                  'Download': function(episode) {
                    console.log(selected.text, 'Download', episode);
                  },
                  'Podcast Info': function(episode) {
                    console.log(selected.text, 'Podcast Info', episode);
                  }
                });
              })
              .catch((err) => {
                console.log(err);
              })
              .finally(() => {
                this.$router.hideLoading();
              });
              break;
            case 'Help & Support':
              this.$router.push('helpSupport');
              break;
            case 'Changelogs':
              this.$router.push('changelogs');
              break;
            case 'Exit':
              window.close();
              break;
          }
        }, () => {});
      }
    },
    softKeyInputFocusText: { left: 'Copy', center: 'Paste', right: 'Cut' },
    softKeyInputFocusListener: {
      left: function() {},
      center: function() {},
      right: function() {}
    },
    dPadNavListener: {
      arrowUp: function() {
        this.navigateListNav(-1);
      },
      arrowRight: function() {
        // this.navigateTabNav(-1);
      },
      arrowDown: function() {
        this.navigateListNav(1);
      },
      arrowLeft: function() {
        // this.navigateTabNav(1);
      },
    }
  });

  const router = new KaiRouter({
    title: 'PodKast',
    routes: {
      'index' : {
        name: 'home',
        component: home
      },
      'helpSupport' : {
        name: 'helpSupport',
        component: helpSupport
      },
      'changelogs' : {
        name: 'changelogs',
        component: changelogs
      }
    }
  });

  const app = new Kai({
    name: '_APP_',
    data: {},
    templateUrl: document.location.origin + '/templates/template.html',
    mounted: function() {},
    unmounted: function() {},
    router,
    state
  });

  try {
    app.mount('app');
  } catch(e) {
    console.log(e);
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
  .then((swReg) => {
    console.error('Service Worker Registered');
  })
  .catch((error) => {
    console.error('Service Worker Error', error);
  });
}
