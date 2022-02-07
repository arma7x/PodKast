var BOOT = false;
var SLEEP_TIMER = null;
var WAKE_LOCK = null;
var QR_READER = null;
var MAIN_DURATION_SLIDER;
var MAIN_CURRENT_TIME;
var MAIN_DURATION;
var MAIN_THUMB;
var MAIN_TITLE;
var MAIN_PLAY_BTN;
var MAIN_THUMB_BUFF;
const APP_VERSION = '1.0.0';
const KEY = 'PODCASTINDEX_KEY';
const SECRET = 'PODCASTINDEX_SECRET';
const DB_NAME = 'PODKAST';
const TABLE_PODCASTS = 'PODCASTS';
const TABLE_SUBSCRIBED = 'SUBSCRIBED_PODCASTS'; // [feedId, feedId, feedId, feedId, ...]
const TABLE_EPISODES = 'PODCAST_EPISODES';
const TABLE_BOOKMARKED = 'BOOKMARKED_EPISODES';
const TABLE_THUMBS = 'THUMBNAILS';
const CATEGORIES = 'CATEGORIES';
const AUTOPLAY = 'AUTOPLAY';
const AUTOSLEEP = 'AUTOSLEEP';
const ACTIVE_PODCAST = 'ACTIVE_PODCAST';
const ACTIVE_EPISODE = 'ACTIVE_EPISODE';

window.addEventListener("load", () => {

  const DS = new DataStorage(() => {}, () => {}, false);

  const DEFAULT_VOLUME = 0.02;

  const MAIN_PLAYER = document.createElement("audio");
  MAIN_PLAYER.volume = 1;
  MAIN_PLAYER.mozAudioChannelType = 'content';
  MAIN_PLAYER.addEventListener('timeupdate', (evt) => {
    T_EPISODES.getItem(localStorage.getItem(ACTIVE_PODCAST).toString())
    .then((episodes) => {
      if (episodes != null && episodes[localStorage.getItem(ACTIVE_EPISODE)] != null) {
        const episode = episodes[localStorage.getItem(ACTIVE_EPISODE)];
        episode['podkastLastDuration'] = evt.target.currentTime;
        episodes[localStorage.getItem(ACTIVE_EPISODE)] = episode;
        T_EPISODES.setItem(localStorage.getItem(ACTIVE_PODCAST).toString(), episodes);
      }
    })
    .catch((err) => {
      console.log(err);
    });
  });

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

  const T_THUMBS = localforage.createInstance({
    name: DB_NAME,
    storeName: TABLE_THUMBS
  });

  const state = new KaiState({
    [CATEGORIES]: [],
    [TABLE_SUBSCRIBED]: [],
    [TABLE_BOOKMARKED]: {},
    [AUTOPLAY]: JSON.parse(localStorage.getItem(AUTOPLAY)) || false,
    [AUTOSLEEP]: JSON.parse(localStorage.getItem(AUTOSLEEP)) || false,
    [ACTIVE_PODCAST]: localStorage.getItem(ACTIVE_PODCAST) || false,
    [ACTIVE_EPISODE]: localStorage.getItem(ACTIVE_EPISODE) || false,
    [KEY]: localStorage.getItem(KEY) || false,
    [SECRET]: localStorage.getItem(SECRET) || false,
  });

  const initTableSubscribed = function() {
    localforage.getItem(TABLE_SUBSCRIBED)
    .then((list) => {
      if (list == null) {
        list = [];
      }
      state.setState(TABLE_SUBSCRIBED, list);
    })
    .catch((err) =>{
      console.log(err);
    });
  }
  initTableSubscribed();

  const subscribePodcast = function($router, podcast) {
    var id = podcast.id
    var msg;
    localforage.getItem(TABLE_SUBSCRIBED)
    .then((list) => {
      if (list == null) {
        list = [];
      }
      if (list.indexOf(id) === -1) {
        list.push(id);
        msg = 'SUBSCRIBED';
      } else {
        list.splice(list.indexOf(id), 1);
        msg = 'UNSUBSCRIBED';
      }
      return localforage.setItem(TABLE_SUBSCRIBED, list);
    })
    .then(() =>{
      $router.showToast(msg);
      if (msg === 'SUBSCRIBED') {
        syncPodcast($router, podcast)
        .then((result) => {
          console.log(result);
        })
        .catch((err) => {
          console.log(err);
        });
      }
      initTableSubscribed();
    })
    .catch((err) =>{
      console.log(err);
    });
  }

  const initTableBookmarked = function() {
    const temp = {};
    T_BOOKMARKED.iterate((value, key, iterationNumber) => {
      temp[key] = value;
    })
    .then(() => {
      state.setState(TABLE_BOOKMARKED, temp);
    })
    .catch((err) =>{
      console.log(err);
    });
  }
  initTableBookmarked();

  const addBookmark = function($router, episode) {
    delete episode['podkastTitle'];
    delete episode['podkastThumb'];
    delete episode['podkastBookmark'];
    delete episode['podkastPlaying'];
    delete episode['podkastCursor'];
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
      $router.showToast('ADD TO FAVOURITE');
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
      $router.showToast('REMOVE FROM FAVOURITE');
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
        state.setState(CATEGORIES, temp);
      }
    })
    .catch((err) => {
      console.log(err);
    })
  }
  initCategories();

  const syncPodcast = function($router, podcast) {
    return new Promise((resolve, reject) => {
      id = podcast.id;
      $router.showLoading();
      Promise.all([podcastIndex.getFeed(id), T_PODCASTS.getItem(id.toString()), extractPodcastEpisodesFromRSS($router, podcast), T_EPISODES.getItem(id.toString())])
      .then((results) => {
        var localPodcast = results[1];
        if (localPodcast == null) {
          console.log('Podcast !Cached:', id);
          localPodcast = {};
          localPodcast['podkastCurrentEpisode'] = results[2][results[2].length - 1]['id'];
        }
        localPodcast = Object.assign(localPodcast, results[0].response.feed);
        var localEpisodes = results[3];
        if (localEpisodes == null) {
          localEpisodes = {};
        }
        results[2].forEach((episode) => {
          if (localEpisodes[episode['id']] == null) { // !CACHE
            console.log('Podcast Ep !Cached:', id, episode['id']);
            localEpisodes[episode['id']] = {};
            localEpisodes[episode['id']]['podkastLocalPath'] = false;
            localEpisodes[episode['id']]['podkastLastDuration'] = 0;
          }
          localEpisodes[episode['id']] = Object.assign(localEpisodes[episode['id']], episode);
        });
        var newEpisode = 0;
        if (results[3] != null && Object.keys(results[3]).length > 0) {
          if (Object.keys(localEpisodes).length > Object.keys(results[3]).length)
            newEpisode = Object.keys(localEpisodes).length - Object.keys(results[3]).length;
        }
        localPodcast['episodeCount'] = Object.keys(localEpisodes).length;
        return Promise.all([T_PODCASTS.setItem(id.toString(), localPodcast), T_EPISODES.setItem(id.toString(), localEpisodes), Promise.resolve(newEpisode)]);
      })
      .then((saved) => {
        const result = {
          podcast: saved[0],
          episodes: saved[1],
          newEpisode: saved[2]
        }
        resolve(result);
      })
      .catch((err) => {
        reject(err);
      })
      .finally(() => {
        $router.hideLoading();
      });
    });
  }

  const listenPodcast = function($router, podcast) {
    delete podcast['podkastSubscribe'];
    delete podcast['podkastThumb'];
    delete podcast['podkastTitle'];
    delete podcast['podkastListening'];
    T_PODCASTS.getItem(podcast['id'].toString())
    .then((savedPodcast) => {
      if (savedPodcast != null) {
        T_EPISODES.getItem(podcast['id'].toString())
        .then((savedEpisodes) => {
          setTimeout(() => {
            playPodcast($router, savedEpisodes[savedPodcast['podkastCurrentEpisode']], true);
          }, 1000);
          $router.pop();
        })
        .catch((err) => {
          console.log(err);
        });
      } else {
        syncPodcast($router, podcast)
        .then((result) => {
          setTimeout(() => {
            playPodcast($router, result.episodes[result.podcast['podkastCurrentEpisode']], true);
          }, 1000);
          $router.pop();
        })
        .catch((err) => {
          console.log(err);
          $router.showToast('Fail SYNC');
        });
      }
    })
    .catch((err) => {
      console.log(err);
    });
  }

  const playPodcast = function($router, episode, playable = true) {
    const loadedmetadata = () => {
      MAIN_PLAYER.fastSeek(episode['podkastLastDuration']);
      MINI_PLAYER.removeEventListener('loadedmetadata', loadedmetadata);
    }
    state.setState(ACTIVE_PODCAST, episode['feedId']);
    localStorage.setItem(ACTIVE_PODCAST, episode['feedId']);
    state.setState(ACTIVE_EPISODE, episode['id']);
    localStorage.setItem(ACTIVE_EPISODE, episode['id']);
    const resolveMedia = new Promise((resolve, reject) => {
      if (episode['podkastLocalPath'] != false) {
        DS.__getFile__(episode['podkastLocalPath'])
        .then((file) => {
          resolve(window.URL.createObjectURL(file));
        })
        .catch((err) => {
          verifyDomainSSL(episode['enclosureUrl'])
          .then((url) => {
            $router.showToast('Stream from network');
            resolve(url);
          })
          .catch((err) => {
            reject(err);
          });
        });
      } else {
        verifyDomainSSL(episode['enclosureUrl'])
        .then((url) => {
          resolve(url);
        })
        .catch((err) => {
          reject(err);
        });
      }
    });
    resolveMedia
    .then((url) => {
      console.log('playPodcast:', url);
      MINI_PLAYER.pause();
      MAIN_PLAYER.addEventListener('loadedmetadata', loadedmetadata);
      MAIN_PLAYER.src = url;
      MAIN_PLAYER.play();
      T_PODCASTS.getItem(episode['feedId'].toString())
      .then((savedPodcast) => {
        if (savedPodcast != null) {
          savedPodcast['podkastCurrentEpisode'] = episode['id'];
          T_PODCASTS.setItem(episode['feedId'].toString(), savedPodcast);
        }
      })
      .catch((err) => {
        console.log(err);
      });
    })
    .catch((err) => {
      console.log(err);
      $router.showToast('Unable to play podcast');
    });
  }

  const playEpisode = function($router, episode, playable = true, cb = () => {}) {
    delete episode['podkastTitle'];
    delete episode['podkastThumb'];
    delete episode['podkastBookmark'];
    delete episode['podkastPlaying'];
    delete episode['podkastCursor'];
    return T_EPISODES.getItem(episode['feedId'].toString())
    .then((episodesObj) => {
      if (episodesObj == null) {
        episodesObj = {};
      }
      var tempEpisode = episodesObj[episode['id']];
      if (tempEpisode == null) { // !CACHE
        console.log('Podcast Ep !Cached:', episode['feedId'], episode['id']);
        tempEpisode = {};
        tempEpisode['podkastLocalPath'] = episode['podkastLocalPath'] || false;
        tempEpisode['podkastLastDuration'] = episode['podkastLastDuration'] || 0;
        tempEpisode = Object.assign(episode, tempEpisode);
      } else if (!playable){
        episode['podkastLastDuration'] = tempEpisode['podkastLastDuration'];
        tempEpisode = Object.assign(tempEpisode, episode);
      }
      episodesObj[episode['id']] = tempEpisode;
      T_EPISODES.setItem(episode['feedId'].toString(), episodesObj);
      if (playable)
        miniPlayer($router, episodesObj[episode['id']], cb);
      return Promise.resolve(episodesObj[episode['id']]);
    })
    .catch((err) => {
      miniPlayer($router, episode, cb);
      return Promise.reject(err);
    });
  }

  const getRSSFromServer = function(url, query = {}, header = {}, podcast) {
    return new Promise((resolve, reject) => {
      xhr('GET', url, {}, query, header)
      .then((result) => {
        var parser = new DOMParser();
        const xml = parser.parseFromString(result.response, "text/xml");
        const items = xml.getElementsByTagName("item");
        const episodes = [];
        Array.prototype.slice.call(items).forEach((item) => {
          const date = new Date(item.getElementsByTagName("pubDate")[0].childNodes[0].nodeValue).getTime();
          const enclosureUrl = item.getElementsByTagName("enclosure")[0].getAttribute('url');
          const desc = item.getElementsByTagName("description");
          const img = item.getElementsByTagName("itunes:image");
          const duration = item.getElementsByTagName("itunes:duration");
          const feedTitle = xml.getElementsByTagName("title");
          episodes.push({
            id: sha1(btoa(enclosureUrl + date.toString())),
            title: item.getElementsByTagName("title")[0].childNodes[0].nodeValue,
            duration: duration.length > 0 ? convertTime(duration[0].childNodes[0].nodeValue) : false,
            description: desc.length > 0 ? desc[0].textContent.trim() : '',
            date: date,
            pubDate: item.getElementsByTagName("pubDate")[0].childNodes[0].nodeValue,
            enclosureUrl: enclosureUrl,
            enclosureType: item.getElementsByTagName("enclosure")[0].getAttribute('type'),
            enclosureLength: readableFileSize(item.getElementsByTagName("enclosure")[0].getAttribute('length'), true, 2),
            image: img.length > 0 ? img[0].getAttribute('href') : '',
            feedImage: podcast['image'],
            feedId: podcast['id'],
            feedTitle: feedTitle.length > 0 ? feedTitle[0].childNodes[0].nodeValue : '',
          });
        });
        resolve(episodes);
      })
      .catch((err) => {
        console.log(err);
        reject('Network Error');
      });
    });
  }

  const extractPodcastEpisodesFromRSS = function($router, podcast) {
    return new Promise((resolve, reject) => {
      verifyDomainSSL(podcast.url || podcast.originalUrl)
      .then((url) => {
        getRSSFromServer(url, {}, {'content-type': podcast.contentType}, podcast)
        .then((episodes) => {
          resolve(episodes);
        })
        .catch((err) => {
          reject(err);
        });
      })
      .catch((err) => {
        const obj = podcastIndex.makeRss(podcast.url || podcast.originalUrl, {}, {'content-type': podcast.contentType}, true);
        resolve(getRSSFromServer(obj.url, obj.query, {}, podcast))
        .then((episodes) => {
          resolve(episodes);
        })
        .catch((err) => {
          reject(err);
        });
      });
    });
  }

  const thumbRepository = function(TABLE_SRC) {
    const thumbHash = {};

    return function(url) {
      const id = sha1(btoa(url));
      if (thumbHash[id] != null) {
        return Promise.resolve(thumbHash[id]);
      }
      return new Promise((resolve, reject) => {
        TABLE_SRC.getItem(id)
        .then((blob) => {
          if (blob == null) {
            const req = new XMLHttpRequest({ mozSystem: true });
            req.responseType = 'blob';
            req.onreadystatechange = function() {
              if (req.readyState == 4) {
                if (req.status >= 200 && req.status <= 399) {
                  TABLE_SRC.setItem(id, req.response)
                  .then((imgBlob) => {
                    if (thumbHash[id] == null) {
                      const blobURL = window.URL.createObjectURL(imgBlob);
                      thumbHash[id] = blobURL;
                      resolve(blobURL);
                    } else {
                      resolve(thumbHash[id]);
                    }
                  }).catch((err) => {
                    const localURL = '/icons/icon112x112.png';
                    thumbHash[id] = localURL;
                    resolve(localURL);
                  });
                } else {
                  const localURL = '/icons/icon112x112.png';
                  thumbHash[id] = localURL;
                  resolve(localURL);
                }
              }
            };
            req.open('GET', url, true);
            req.send();
          } else {
            var blobURL;
            if (blob instanceof Blob) {
              blobURL = window.URL.createObjectURL(blob);
            } else if (blob instanceof ArrayBuffer) {
              blobURL = window.URL.createObjectURL(new Blob([blob]));
            }
            thumbHash[id] = blobURL;
            resolve(blobURL);
          }
        })
        .catch(() => {
          const localURL = '/icons/icon112x112.png';
          thumbHash[id] = localURL;
          resolve(localURL);
        });
      });
    }
  }

  const getThumb = thumbRepository(T_THUMBS);

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
          'question': 'TODO',
          'answer': `TODO`,
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

  const settingPage = new Kai({
    name: 'setting',
    data: {
      title: 'setting',
      autoplay: false,
      autosleep: false,
      apikey: false,
      apisecret: false,
    },
    verticalNavClass: '.settingNav',
    templateUrl: document.location.origin + '/templates/setting.html',
    mounted: function() {
      if (navigator.mediaDevices)
        navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      this.$router.setHeaderTitle('Settings');
      this.methods.listenState(this.$state.getState());
      this.$state.addGlobalListener(this.methods.listenState);
      this.methods.renderSoftKeyText();
    },
    unmounted: function() {
      this.$state.removeGlobalListener(this.methods.listenState);
    },
    methods: {
      listenState: function(data) {
        const obj = {};
        if (data[AUTOSLEEP] != null) {
          obj['autosleep'] = JSON.parse(data[AUTOSLEEP]);
        }
        if (data[AUTOPLAY] != null) {
          obj['autoplay'] = JSON.parse(data[AUTOPLAY]);
        }
        if (data[KEY] === false) {
          obj['apikey'] = false;
        } else {
          obj['apikey'] = true;
        }
        if (data[SECRET] === false) {
          obj['apisecret'] = false;
        } else {
          obj['apisecret'] = true;
        }
        this.setData(obj);
      },
      changeAutoSleep: function() {
        const choices = [
          { 'text': 'Off', value: false },
          { 'text': '1 Minutes(TEST)', value: 1 },
          { 'text': '10 Minutes', value: 10 },
          { 'text': '20 Minutes', value: 20 },
          { 'text': '30 Minutes', value: 30 },
          { 'text': '40 Minutes', value: 40 },
          { 'text': '50 Minutes', value: 50 },
          { 'text': '60 Minutes', value: 60 },
        ]
        const idx = choices.findIndex((opt) => {
          return opt.value === this.data.autosleep;
        });
        this.$router.showOptionMenu('Sleep Timer', choices, 'SELECT', (selected) => {
          const value = JSON.parse(selected.value);
          localStorage.setItem(AUTOSLEEP, value);
          this.$state.setState(AUTOSLEEP, JSON.parse(localStorage.getItem(AUTOSLEEP)));
        }, this.methods.renderSoftKeyText, idx);
      },
      changeAutoPlay: function() {
        const value = !this.data.autoplay;
        localStorage.setItem(AUTOPLAY, value);
        this.$state.setState(AUTOPLAY, JSON.parse(localStorage.getItem(AUTOPLAY)));
      },
      setApiKey: function(key) {
        this.$router.hideBottomSheet();
        if (key == null)
          return;
        key = key.replace('http://', '');
        localStorage.setItem(KEY, key);
        this.$state.setState(KEY, key);
        alert(this.$state.getState(KEY));
      },
      setApiSecret: function(secret) {
        this.$router.hideBottomSheet();
        if (secret == null)
          return;
        secret = secret.replace('http://', '');
        localStorage.setItem(SECRET, secret);
        this.$state.setState(SECRET, secret);
        alert(this.$state.getState(SECRET));
      },
      renderSoftKeyText: function() {
        setTimeout(() => {
          if (this.verticalNavIndex == 2) {
            this.$router.setSoftKeyText('Clear', 'SET', 'Show');
          } else if (this.verticalNavIndex == 3) {
            this.$router.setSoftKeyText('Clear', 'SET', 'Show');
          } else {
            this.$router.setSoftKeyText('', 'SELECT', '');
          }
        }, 100);
      }
    },
    softKeyText: { left: '', center: 'SELECT', right: '' },
    softKeyListener: {
      left: function() {
        if (this.verticalNavIndex == 2) {
          localStorage.removeItem(KEY);
          this.$state.setState(KEY, false);
        } else if (this.verticalNavIndex == 3) {
          localStorage.removeItem(SECRET);
          this.$state.setState(SECRET, false);
        }
      },
      center: function() {
        const listNav = document.querySelectorAll(this.verticalNavClass);
        if (this.verticalNavIndex > -1) {
          if (listNav[this.verticalNavIndex]) {
            if (this.verticalNavIndex == 2) {
              qrReader(this.$router, this.methods.setApiKey);
            } else if (this.verticalNavIndex == 3) {
              qrReader(this.$router, this.methods.setApiSecret);
            } else {
              listNav[this.verticalNavIndex].click();
            }
          }
        }
      },
      right: function() {
        if (this.verticalNavIndex == 2) {
          //this.$state.getState(KEY);
          alert(localStorage.getItem(KEY));
        } else if (this.verticalNavIndex == 3) {
          //this.$state.getState(SECRET);
          alert(localStorage.getItem(SECRET));
        }
      }
    },
    dPadNavListener: {
      arrowUp: function() {
        this.navigateListNav(-1);
        this.methods.renderSoftKeyText();
      },
      arrowDown: function() {
        this.navigateListNav(1);
        this.methods.renderSoftKeyText();
      }
    }
  });

  const descriptionPage = function($router, data) {
    $router.push(
      new Kai({
        name: 'descriptionPage',
        data: {
          title: data.title,
          description: data.description
        },
        templateUrl: document.location.origin + '/templates/description.html',
        mounted: function() {
          this.$router.setHeaderTitle(data.title);
        },
        unmounted: function() {},
        methods: {},
        softKeyText: { left: '', center: '', right: '' },
        softKeyListener: {
          left: function() {},
          center: function() {},
          right: function() {}
        }
      })
    );
  }

  const downloaderPopup = function($router, episode, cb = () => {}) {
    delete episode['podkastTitle'];
    delete episode['podkastThumb'];
    delete episode['podkastBookmark'];
    delete episode['podkastPlaying'];
    delete episode['podkastCursor'];
    const URL = episode['enclosureUrl'];
    return new Promise((resolve, reject) => {
      var BAR, CUR, MAX;
      var start = 0;
      var loaded = 0;
      var req = new XMLHttpRequest({ mozSystem: true });
      req.open('GET', URL, true);
      req.responseType = 'blob';

      $router.showBottomSheet(
        new Kai({
          name: 'downloaderPopup',
          data: {
            title: 'downloaderPopup',
            episode: episode,
            downloading: false,
          },
          templateUrl: document.location.origin + '/templates/downloaderPopup.html',
          softKeyText: { left: 'Cancel', center: '0KB/S', right: '0%' },
          softKeyListener: {
            left: function() {
              $router.hideBottomSheet();
              req.abort();
            },
            center: function() {},
            right: function() {}
          },
          mounted: function() {
            const lock = navigator.b2g || navigator;
            WAKE_LOCK = lock.requestWakeLock('cpu');
            BAR = document.getElementById('download_bar');
            CUR = document.getElementById('download_cur');
            MAX = document.getElementById('download_max');
            req.onprogress = this.methods.onprogress;
            req.onreadystatechange = this.methods.onreadystatechange;
            req.onerror = this.methods.onerror;
            start = new Date().getTime();
            req.send();
          },
          unmounted: function() {
            if (WAKE_LOCK) {
              WAKE_LOCK.unlock();
              WAKE_LOCK = null;
            }
            resolve(episode);
            setTimeout(cb, 100);
          },
          methods: {
            onprogress: function(evt) {
              if (evt.lengthComputable) {
                var end = new Date().getTime();
                var elapsed = end - start;
                start = end;
                var percentComplete = evt.loaded / evt.total * 100;
                const frag = evt.loaded - loaded;
                loaded = evt.loaded;
                const speed = (frag / elapsed) * 1000;
                BAR.style.width = `${percentComplete.toFixed(2)}%`;
                CUR.innerHTML = `${readableFileSize(evt.loaded, true, 2)}`;
                $router.setSoftKeyCenterText(`${readableFileSize(Math.round(speed), true)}/s`);
                $router.setSoftKeyRightText(BAR.style.width);
                MAX.innerHTML = `${readableFileSize(evt.total, true, 2)}`;
              }
            },
            onreadystatechange: function(evt) {
              if (evt.currentTarget.readyState === 4) {
                if (evt.currentTarget.status >= 200 && evt.currentTarget.status <= 399) {
                  var ext = 'mp3';
                  if (MIME[evt.currentTarget.response.type] != null) {
                    ext = MIME[evt.currentTarget.response.type];
                  }
                  var localPath = ['podkast', 'cache', episode['feedId']];
                  if (DS.deviceStorage.storageName != '') {
                    localPath = [DS.deviceStorage.storageName, ...localPath];
                  }
                  DS.addFile(localPath, `${episode['id']}.${ext}`, evt.currentTarget.response)
                  .then((file) => {
                    episode['podkastLocalPath'] = file.name;
                    $router.setSoftKeyCenterText('SUCCESS');
                    $router.setSoftKeyLeftText('Close');
                    if (WAKE_LOCK) {
                      WAKE_LOCK.unlock();
                      WAKE_LOCK = null;
                    }
                    if (document.visibilityState === 'hidden') {
                      pushLocalNotification(episode['title'], 'Done downloading', true, true);
                    }
                  })
                  .catch((err) => {
                    console.log(err);
                    $router.setSoftKeyCenterText('FAIL');
                    $router.setSoftKeyLeftText('Exit');
                  });
                }
              }
            },
            onerror: function(err) {
              console.log(err);
              $router.setSoftKeyCenterText('FAIL');
              $router.setSoftKeyRightText('Exit');
              $router.showToast('Network Error');
            }
          },
          backKeyListener: function(evt) {
            return true;
          }
        })
      );
    });
  }

  const qrReader = function($router, cb = () => {}) {
    $router.showBottomSheet(
      new Kai({
        name: 'qrReader',
        data: {
          title: 'qrReader'
        },
        template: `<div class="kui-flex-wrap" style="overflow:hidden!important;height:264px;"><video id="qr_video" height="320" width="240" autoplay></video></div>`,
        mounted: function() {
          setTimeout(() => {
            navigator.spatialNavigationEnabled = false;
          }, 100);
          navigator.mediaDevices.getUserMedia({ audio: false, video: true })
          .then((stream) => {
            const video = document.getElementById("qr_video");
            video.srcObject = stream;
            video.onloadedmetadata = (e) => {
              video.play();
              var barcodeCanvas = document.createElement("canvas");
              QR_READER = setInterval(() => {
                barcodeCanvas.width = video.videoWidth;
                barcodeCanvas.height = video.videoHeight;
                var barcodeContext = barcodeCanvas.getContext("2d");
                var imageWidth = Math.max(1, Math.floor(video.videoWidth)),imageHeight = Math.max(1, Math.floor(video.videoHeight));
                barcodeContext.drawImage(video, 0, 0, imageWidth, imageHeight);
                var imageData = barcodeContext.getImageData(0, 0, imageWidth, imageHeight);
                var idd = imageData.data;
                let code = jsQR(idd, imageWidth, imageHeight);
                if (code) {
                  cb(code.data);
                }
              }, 1000);
            };
          }).catch((err) => {
            $router.showToast(err.toString());
          });
        },
        unmounted: function() {
          if (QR_READER) {
            clearInterval(QR_READER);
            QR_READER = null;
          }
          const video = document.getElementById("qr_video");
          const stream = video.srcObject;
          const tracks = stream.getTracks();
          tracks.forEach(function (track) {
            track.stop();
          });
          video.srcObject = null;
        },
      })
    );
  }

  const miniPlayer = function($router, episode, cb = () => {}) {
    var MINI_THUMB, DURATION_SLIDER, CURRENT_TIME, DURATION, PLAY_BUTTON, THUMB_BUFF;
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
          MINI_THUMB = document.getElementById('mini_thumb');
          DURATION_SLIDER = document.getElementById('mini_duration_slider');
          CURRENT_TIME = document.getElementById('mini_current_time');
          DURATION = document.getElementById('mini_duration');
          PLAY_BTN = document.getElementById('mini_play_btn');
          THUMB_BUFF = document.getElementById('thumbx_buffering');
          THUMB_BUFF.style.visibility = 'visible';
          if (episode['feedImage'] == null || episode['feedImage'] == '')
            episode['feedImage'] = '/icons/icon112x112.png';
          if (episode['image'] == null || episode['image'] == '')
            episode['image'] = episode['feedImage'];
          getThumb(episode['image'])
          .then((url) => {
            const img = MINI_THUMB;
            img.onload = () => {
              if (img.complete)
                THUMB_BUFF.style.visibility = 'hidden';
            }
            if (img != null) {
              img.src = url;
            } else {
              img.src = '/icons/icon112x112.png';
            }
          })
          .catch((err) => {
            console.log(err);
          });
          MINI_PLAYER.addEventListener('loadedmetadata', this.methods.onloadedmetadata);
          MINI_PLAYER.addEventListener('timeupdate', this.methods.ontimeupdate);
          MINI_PLAYER.addEventListener('pause', this.methods.onpause);
          MINI_PLAYER.addEventListener('play', this.methods.onplay);
          MINI_PLAYER.addEventListener('seeking', this.methods.onseeking);
          MINI_PLAYER.addEventListener('seeked', this.methods.onseeked);
          MINI_PLAYER.addEventListener('ratechange', this.methods.onratechange);
          MINI_PLAYER.addEventListener('error', this.methods.onerror);
          document.addEventListener('keydown', this.methods.onKeydown);
          const resolveMedia = new Promise((resolve, reject) => {
            if (episode['podkastLocalPath'] != false) {
              DS.__getFile__(episode['podkastLocalPath'])
              .then((file) => {
                resolve(window.URL.createObjectURL(file));
              })
              .catch((err) => {
                verifyDomainSSL(episode['enclosureUrl'])
                .then((url) => {
                  $router.showToast('Stream from network');
                  resolve(url);
                })
                .catch((err) => {
                  reject(err);
                });
              });
            } else {
              verifyDomainSSL(episode['enclosureUrl'])
              .then((url) => {
                resolve(url);
              })
              .catch((err) => {
                reject(err);
              });
            }
          });
          resolveMedia
          .then((url) => {
            console.log('miniPlayer:', url);
            MAIN_PLAYER.pause();
            MINI_PLAYER.src = url;
            MINI_PLAYER.play();
            this.methods.onratechange();
          })
          .catch((err) => {
            console.log(err);
            $router.showToast('Network Error');
          });
        },
        unmounted: function() {
          MINI_PLAYER.pause();
          MINI_PLAYER.removeEventListener('loadedmetadata', this.methods.onloadedmetadata);
          MINI_PLAYER.removeEventListener('timeupdate', this.methods.ontimeupdate);
          MINI_PLAYER.removeEventListener('pause', this.methods.onpause);
          MINI_PLAYER.removeEventListener('play', this.methods.onplay);
          MINI_PLAYER.removeEventListener('seeking', this.methods.onseeking);
          MINI_PLAYER.removeEventListener('seeked', this.methods.onseeked);
          MINI_PLAYER.removeEventListener('ratechange', this.methods.onratechange);
          MINI_PLAYER.removeEventListener('error', this.methods.onerror);
          document.removeEventListener('keydown', this.methods.onKeydown);
          setTimeout(() => {
            cb();
            state.setState(TABLE_BOOKMARKED, state.getState(TABLE_BOOKMARKED));
          }, 100);
        },
        methods: {
          onloadedmetadata: function(evt) {
            MINI_PLAYER.fastSeek(episode['podkastLastDuration']);
            var duration = evt.target.duration;
            DURATION.innerHTML = convertTime(evt.target.duration);
            DURATION_SLIDER.setAttribute("max", duration);
          },
          ontimeupdate: function(evt) {
            var currentTime = evt.target.currentTime;
            CURRENT_TIME.innerHTML = convertTime(evt.target.currentTime);
            DURATION_SLIDER.value = currentTime;
            PLAY_BTN.src = '/icons/pause.png';
            T_EPISODES.getItem(episode['feedId'].toString())
            .then((episodes) => {
              if (episodes != null && episodes[episode['id']] != null) {
                const update = episodes[episode['id']];
                update['podkastLastDuration'] = evt.target.currentTime;
                episodes[episode['id']] = update;
                T_EPISODES.setItem(episode['feedId'].toString(), episodes);
              }
            })
            .catch((err) => {
              console.log(err);
            });
          },
          onpause: function() {
            PLAY_BTN.src = '/icons/play.png';
          },
          onplay: function() {
            PLAY_BTN.src = '/icons/pause.png';
          },
          onseeking: function(evt) {
            THUMB_BUFF.style.visibility = 'visible';
            CURRENT_TIME.innerHTML = convertTime(evt.target.currentTime);
            DURATION_SLIDER.value = evt.target.currentTime;
          },
          onseeked: function(evt) {
            THUMB_BUFF.style.visibility = 'hidden';
          },
          onratechange: function() {
            $router.setSoftKeyCenterText(`${MINI_PLAYER.playbackRate}x`);
          },
          onerror: function (evt) {
            $router.showToast(evt.toString());
          },
          onKeydown: function(evt) {
            if (MINI_PLAYER.duration <= 0)
              return;
            switch(evt.key) {
              case 'Call':
                MINI_PLAYER.fastSeek(0);
                break;
              case '1':
                var time = MINI_PLAYER.currentTime - 30;
                if (time <= 0)
                  time = 0;
                MINI_PLAYER.fastSeek(time);
                break;
              case '3':
                var time = MINI_PLAYER.currentTime + 30;
                if (time >= MINI_PLAYER.duration)
                  time = MINI_PLAYER.duration;
                MINI_PLAYER.fastSeek(time);
                break;
              case '4':
                var time = MINI_PLAYER.currentTime - 60;
                if (time <= 0)
                  time = 0;
                MINI_PLAYER.fastSeek(time);
                break;
              case '6':
                var time = MINI_PLAYER.currentTime + 60;
                if (time >= MINI_PLAYER.duration)
                  time = MINI_PLAYER.duration;
                MINI_PLAYER.fastSeek(time);
                break;
              case '7':
                var time = MINI_PLAYER.currentTime - (0.01 * MINI_PLAYER.duration);
                if (time <= 0)
                  time = 0;
                MINI_PLAYER.fastSeek(time);
                break;
              case '9':
                var time = MINI_PLAYER.currentTime + (0.01 * MINI_PLAYER.duration);
                if (time >= MINI_PLAYER.duration)
                  time = MINI_PLAYER.duration;
                MINI_PLAYER.fastSeek(time);
                break;
              case '2':
                if (MINI_PLAYER.playbackRate >= 4)
                  return
                MINI_PLAYER.playbackRate += 0.25;
                break;
              case '5':
                MINI_PLAYER.playbackRate = 1;
                break;
              case '8':
                if (MINI_PLAYER.playbackRate <= 0.5)
                  return
                MINI_PLAYER.playbackRate -= 0.25;
                break;
            }
          },
        },
        dPadNavListener: {
          arrowUp: function() {
            volumeUp(MINI_PLAYER);
          },
          arrowRight: function() {
            MINI_PLAYER.fastSeek(MINI_PLAYER.currentTime + 10);
          },
          arrowDown: function() {
            volumeDown(MINI_PLAYER);
          },
          arrowLeft: function() {
            MINI_PLAYER.fastSeek(MINI_PLAYER.currentTime - 10);
          },
        },
        backKeyListener: function(evt) {
          return -1;
        }
      })
    );
  }

  const episodeListPage = function($router, title, data = null, rightSoftKeyCallback = {}, episodeId = null) {
    $router.push(
      new Kai({
        name: 'episodeListPage',
        data: {
          title: 'episodeListPage',
          init: true,
          list: [],
          listThumb: {},
          pageCursor: 0,
          pages: [],
        },
        verticalNavClass: '.ePageNav',
        templateUrl: document.location.origin + '/templates/episodeListPage.html',
        mounted: function() {
          state.addStateListener(TABLE_BOOKMARKED, this.methods.listenState);
          this.$router.setHeaderTitle(title);
          const bookmarkList = state.getState(TABLE_BOOKMARKED);
          if (data == null) {
            this.methods.processDataNull(bookmarkList);
          } else {
            this.methods.processData(bookmarkList);
          }
        },
        unmounted: function() {
          state.removeStateListener(TABLE_BOOKMARKED, this.methods.listenState);
        },
        methods: {
          gotoPage: function(cur) {
            this.setData({
              init: false,
              list: this.data.pages[cur],
              pageCursor: cur,
            });
            // $router.showToast(`Page ${this.data.pageCursor + 1}/${this.data.pages.length}`);
            this.methods.optimize();
            this.methods.renderLeftKeyText();
          },
          listenState: function(updated) {
            if (data == null) {
              this.methods.processDataNull(updated);
            } else {
              this.methods.processData(updated);
            }
          },
          processData: function(bookmarkList) {
            var feedId = '000000000000000000000';
            data.forEach((i) => {
              feedId = i['feedId'];
              i['podkastCursor'] = false;
              i['podkastPlaying'] = MAIN_PLAYER.duration > 0 && !MAIN_PLAYER.paused && i['id'].toString() == state.getState(ACTIVE_EPISODE);
              i['podkastTitle'] = i['title'].length >= 41 ? i['title'].slice(0, 38) + '...' : i['title'];
              i['podkastThumb'] = this.data.listThumb[i['id']] || '/icons/loading.gif';
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
            T_PODCASTS.getItem(feedId.toString())
            .then((podcast) => {
              const cursor = podcast != null ? podcast['podkastCurrentEpisode'] : false;
              const pages = [];
              const temp = JSON.parse(JSON.stringify(data));
              if (temp.length === 0) {
                $router.showToast('Empty');
                $router.pop();
                return;
              }
              while (temp.length > 0) {
                pages.push(temp.splice(0, 20));
                if (this.data.init && ((episodeId != null && episodeId != false) || cursor)) {
                  const matchId = episodeId || cursor;
                  pages[pages.length - 1].forEach((ep, idx) => {
                    if (ep['id'] === matchId) {
                      pages[pages.length - 1][idx]['podkastCursor'] = true;
                      this.data.init = false;
                      this.data.pageCursor = pages.length - 1;
                      this.verticalNavIndex = idx;
                    }
                  });
                } else if (cursor) {
                  pages[pages.length - 1].forEach((ep, idx) => {
                    if (ep['id'] === cursor) {
                      pages[pages.length - 1][idx]['podkastCursor'] = true;
                    }
                  });
                }
              }
              this.data.pages = pages;
              this.methods.gotoPage(this.data.pageCursor);
            });
          },
          processDataNull: function(bookmarkList) {
            if (Object.keys(bookmarkList).length === 0) {
              this.setData({ list: [] });
              $router.showToast('Empty');
              $router.pop();
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
                    episodes[id]['podkastThumb'] = this.data.listThumb[id] || '/icons/loading.gif';
                    episodes[id]['podkastTitle'] = episodes[id]['title'].length >= 41 ? episodes[id]['title'].slice(0, 38) + '...' : episodes[id]['title'];
                    episodes[id]['podkastBookmark'] = true;
                    episodes[id]['podkastPlaying'] = MAIN_PLAYER.duration > 0 && !MAIN_PLAYER.paused && episodes[id]['id'].toString() == state.getState(ACTIVE_EPISODE);;
                    episodes[id]['podkastCursor'] = false;
                    temp.push(episodes[id]);
                  }
                  bookmarkSize--;
                  if (bookmarkSize <= 0) {
                    if (temp.length < this.verticalNavIndex + 1) {
                      this.verticalNavIndex--;
                    }
                    this.data.pages = [temp];
                    this.methods.gotoPage(this.data.pageCursor);
                    //this.setData({ list: temp });
                  }
                });
              });
            }
          },
          optimize: function() {
            this.data.list.forEach((l) => {
              if (this.data.listThumb[l.id]) {
                const img = document.getElementById(`thumb_${l.feedId}_${l.id}`);
                if (img != null) {
                  img.src = this.data.listThumb[l.id];
                }
                return;
              }
              setTimeout(() => {
                getThumb(l.image)
                .then((url) => {
                  const img = document.getElementById(`thumb_${l.feedId}_${l.id}`);
                  if (img != null) {
                    this.data.listThumb[l.id] = url;
                    img.src = url;
                  }
                })
                .catch((err) => {
                  console.log(err);
                });
              }, randomIntFromInterval(5, 10) * 100);
            });
          },
          downloadAudio: function(episode) {
            verifyDomainSSL(episode['enclosureUrl'])
            .then((validUrl) => {
              return downloaderPopup($router, episode, this.methods.renderLeftKeyText);
            })
            .then((result) => {
              playEpisode($router, result, false)
              .then((saved) => {
                console.log(saved);
                for (var x in this.data.pages[this.data.pageCursor]) {
                  if (this.data.pages[this.data.pageCursor][x]['id'] === episode['id']) {
                    this.data.pages[this.data.pageCursor][x]['podkastLocalPath'] = saved['podkastLocalPath'];
                    this.methods.gotoPage(this.data.pageCursor);
                    break;
                  }
                }
              })
              .catch((err) => {
                console.log(err);
              });
            })
            .catch((err) => {
              console.log(err);
            });
          },
          deleteAudio: function(episode) {
            const path = episode['podkastLocalPath'].split('/');
            if (path[0] == '') {
              path.splice(0, 1);
            }
            const name = path.pop();
            DS.deleteFile(path, name, true)
            .then((result) => {
              episode['podkastLocalPath'] = false;
              return playEpisode($router, episode, false);
            })
            .then((saved) => {
              for (var x in this.data.pages[this.data.pageCursor]) {
                if (this.data.pages[this.data.pageCursor][x]['id'] === episode['id']) {
                  this.data.pages[this.data.pageCursor][x]['podkastLocalPath'] = false;
                  this.methods.gotoPage(this.data.pageCursor);
                  break;
                }
              }
            })
            .catch((err) => {
              console.log(err);
            });
          },
          renderLeftKeyText: function() {
            if ($router.stack[$router.stack.length - 1].name !== this.name)
              return;
            $router.setSoftKeyLeftText(`${this.data.pageCursor + 1}/${this.data.pages.length}`);
          }
        },
        softKeyText: { left: '', center: 'PLAY', right: 'More' },
        softKeyListener: {
          left: function() {
            if (this.data.list[this.verticalNavIndex] == null)
              return;
          },
          center: function() {
            if (this.data.list[this.verticalNavIndex] == null)
              return;
            if (MAIN_PLAYER.duration > 0 && !MAIN_PLAYER.paused && state.getState(ACTIVE_EPISODE).toString() === this.data.list[this.verticalNavIndex]['id'].toString())
              return;
            if (episodeId != null && episodeId != false) {
              setTimeout(() => {
                playPodcast($router, JSON.parse(JSON.stringify(this.data.list[this.verticalNavIndex])));
              }, 1000);
              $router.pop();
            } else {
              playEpisode($router, JSON.parse(JSON.stringify(this.data.list[this.verticalNavIndex])), true, this.methods.renderLeftKeyText);
            }
          },
          right: function() {
            if (this.data.list[this.verticalNavIndex] == null)
              return;
            const menu = [];
            for (var k in rightSoftKeyCallback) {
              menu.push({ 'text': k });
            }
            if (data !== null) {
              if (this.data.list[this.verticalNavIndex]['podkastBookmark'] === false)
                menu.push({ 'text': 'Add To Favourite' });
            }
            if (this.data.list[this.verticalNavIndex]['podkastBookmark'])
              menu.push({ 'text': 'Remove From Favourite' });
            menu.push({ 'text': 'Description' });
            if (this.data.list[this.verticalNavIndex]['podkastLocalPath'] !== false)
              menu.push({ 'text': 'Delete Audio' });
            else
              menu.push({ 'text': 'Download Audio' });
            this.$router.showOptionMenu('More', menu, 'SELECT', (selected) => {
              if (rightSoftKeyCallback[selected.text]) {
                rightSoftKeyCallback[selected.text](JSON.parse(JSON.stringify(this.data.list[this.verticalNavIndex])));
              } else if (selected.text === 'Add To Favourite') {
                addBookmark($router, JSON.parse(JSON.stringify(this.data.list[this.verticalNavIndex])));
              } else if (selected.text === 'Remove From Favourite') {
                removeBookmark($router, JSON.parse(JSON.stringify(this.data.list[this.verticalNavIndex])));
              } else if (selected.text === 'Description') {
                descriptionPage(this.$router, this.data.list[this.verticalNavIndex]);
              } else if (selected.text === 'Delete Audio') {
                this.methods.deleteAudio(this.data.list[this.verticalNavIndex]);
              } else if (selected.text === 'Download Audio') {
                this.methods.downloadAudio(JSON.parse(JSON.stringify(this.data.list[this.verticalNavIndex])));
              }
            }, () => {
              setTimeout(this.methods.renderLeftKeyText, 100);
            });
          }
        },
        dPadNavListener: {
          arrowLeft: function() {
            if (this.data.pageCursor <= 0)
              return;
            else {
              this.verticalNavIndex = 19;
              this.methods.gotoPage(this.data.pageCursor - 1);
            }
          },
          arrowUp: function() {
            if (this.verticalNavIndex <= 0)
              return;
            this.navigateListNav(-1);
          },
          arrowRight: function() {
            if (this.data.pageCursor >= this.data.pages.length - 1)
              return;
            else {
              this.verticalNavIndex = -1;
              this.methods.gotoPage(this.data.pageCursor + 1);
            }
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

  const podcastListPage = function($router, title, data = null) {
    $router.push(
      new Kai({
        name: 'podcastListPage',
        data: {
          title: 'podcastListPage',
          list: [],
          listThumb: {}
        },
        verticalNavClass: '.pPageNav',
        templateUrl: document.location.origin + '/templates/podcastListPage.html',
        mounted: function() {
          state.addStateListener(TABLE_SUBSCRIBED, this.methods.listenState);
          $router.setHeaderTitle(title);
          const subscribedList = state.getState(TABLE_SUBSCRIBED);
          if (data == null) {
            this.methods.processDataNull(subscribedList);
          } else {
            this.methods.processData(subscribedList);
          }
        },
        unmounted: function() {
          state.removeStateListener(TABLE_SUBSCRIBED, this.methods.listenState);
        },
        methods: {
          listenState: function(updated) {
            if (data == null) {
              this.methods.processDataNull(updated);
            } else {
              this.methods.processData(updated);
            }
          },
          processData: function(subscribedList) {
            if (data.length === 0) {
              $router.showToast('Empty');
              $router.pop();
              return;
            }
            data.forEach((i) => {
              const listen = MAIN_PLAYER.duration > 0 && !MAIN_PLAYER.paused && state.getState(ACTIVE_PODCAST).toString() == i['id'].toString();
              i['podkastListening'] = listen;
              i['podkastTitle'] = i['title'].length >= 31 ? i['title'].slice(0, 28) + '...' : i['title'];
              i['podkastThumb'] = this.data.listThumb[i['id']] || '/icons/loading.gif';
              i['podkastSubscribe'] = false;
              if (i['author'] == null)
                i['author'] = false;
              if (i['image'] == '' || i['image'] == null)
                i['image'] = '/icons/icon112x112.png';
              if (subscribedList.indexOf(i['id']) > -1)
                i['podkastSubscribe'] = true;
            });
            this.setData({ list: data });
            this.methods.optimize();
          },
          processDataNull: function(subscribedList) {
            if (subscribedList.length === 0) {
              this.setData({ list: [] });
              $router.showToast('Empty');
              $router.pop();
              return;
            }
            var temp = [];
            var subscribedSize = subscribedList.length;
            subscribedList.forEach((feedId) => {
              T_PODCASTS.getItem(feedId.toString())
              .then((podcast) => {
                subscribedSize--;
                if (podcast != null) {
                  const listen = MAIN_PLAYER.duration > 0 && !MAIN_PLAYER.paused && state.getState(ACTIVE_PODCAST).toString() === podcast['id'].toString();
                  podcast['podkastListening'] = listen;
                  podcast['podkastSubscribe'] = true;
                  podcast['podkastThumb'] = this.data.listThumb[podcast['id']] || '/icons/loading.gif';
                  podcast['podkastTitle'] = podcast['title'].length >= 31 ? podcast['title'].slice(0, 28) + '...' : podcast['title'];
                  temp.push(podcast);
                }
                if (subscribedSize === 0) {
                  if (temp.length < this.verticalNavIndex + 1) {
                    this.verticalNavIndex--;
                  }
                  this.setData({ list: temp });
                  this.methods.optimize();
                }
              })
              .catch((err) => {
                subscribedSize--;
                if (subscribedSize === 0) {
                  if (temp.length < this.verticalNavIndex + 1) {
                    this.verticalNavIndex--;
                  }
                  this.setData({ list: temp });
                  this.methods.optimize();
                }
              });
            });
          },
          optimize: function() {
            this.data.list.forEach((l) => {
              if (this.data.listThumb[l.id])
                return;
              setTimeout(() => {
                getThumb(l.image)
                .then((url) => {
                  const img = document.getElementById(`thumb_${l.id}`);
                  if (img != null) {
                    this.data.listThumb[l.id] = url;
                    img.src = url;
                  }
                })
                .catch((err) => {
                  console.log(err);
                });
              }, randomIntFromInterval(5, 10) * 100);
            });
          }
        },
        softKeyText: { left: 'Episodes', center: 'LISTEN', right: 'More' },
        softKeyListener: {
          left: function() {
            if (this.data.list[this.verticalNavIndex] == null)
              return;
            if (this.data.list[this.verticalNavIndex]['podkastSubscribe']) {
              T_EPISODES.getItem(this.data.list[this.verticalNavIndex].id.toString())
              .then((episodes) => {
                if (episodes != null) {
                  var temp = [];
                  for (var x in episodes) {
                    temp.push(episodes[x]);
                  }
                  temp.sort((a, b) => b.date - a.date);
                  episodeListPage($router, this.data.list[this.verticalNavIndex].title, temp, {});
                } else {
                  $router.showToast('Required SYNC');
                }
              })
              .catch((err) => {
                console.log(err);
              });
            } else {
              $router.showLoading();
              extractPodcastEpisodesFromRSS($router, this.data.list[this.verticalNavIndex])
              .then((result) => {
                episodeListPage($router, this.data.list[this.verticalNavIndex].title, result, {});
              })
              .catch((err) => {
                console.log(err);
                $router.showToast('Network Error');
              })
              .finally(() => {
                $router.hideLoading();
              });
            }
          },
          center: function() {
            if (this.data.list[this.verticalNavIndex] == null)
              return;
            const podcast = JSON.parse(JSON.stringify(this.data.list[this.verticalNavIndex]));
            if (MAIN_PLAYER.duration > 0 && !MAIN_PLAYER.paused && state.getState(ACTIVE_PODCAST).toString() === podcast['id'].toString())
              return;
            listenPodcast($router, podcast);
          },
          right: function() {
            if (this.data.list[this.verticalNavIndex] == null)
              return;
            const menu = [
              { 'text': 'Description' },
              { 'text': this.data.list[this.verticalNavIndex]['podkastSubscribe'] ? 'Unsubscribe' : 'Subscribe' }
            ];
            if (this.data.list[this.verticalNavIndex]['podkastSubscribe'])
              menu.push({ 'text': 'Sync Podcast' });
            $router.showOptionMenu('More', menu, 'SELECT', (selected) => {
              if (['Unsubscribe', 'Subscribe'].indexOf(selected.text) > -1) {
                subscribePodcast($router, this.data.list[this.verticalNavIndex]);
              } else if (selected.text === 'Description') {
                if (this.data.list[this.verticalNavIndex] == null)
                  return;
                descriptionPage($router, this.data.list[this.verticalNavIndex]);
              } else if (selected.text === 'Sync Podcast') {
                syncPodcast(this.$router, this.data.list[this.verticalNavIndex])
                .then((result) => {
                  if (result['newEpisode'] > 0) {
                    pushLocalNotification(result['podcast']['title'], `${result['newEpisode']} new episode`, true, true);
                    state.setState(TABLE_SUBSCRIBED, state.getState(TABLE_SUBSCRIBED));
                  }
                })
                .catch((err) => {
                  console.log(err);
                  $router.showToast('Fail SYNC');
                });
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

  const home = new Kai({
    name: 'home',
    data: {
      title: 'PodKast',
    },
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
      MAIN_DURATION_SLIDER = document.getElementById('main_duration_slider');
      MAIN_CURRENT_TIME = document.getElementById('main_current_time');
      MAIN_DURATION = document.getElementById('main_duration');
      MAIN_THUMB = document.getElementById('main_thumb');
      MAIN_TITLE = document.getElementById('main_title');
      MAIN_PLAY_BTN = document.getElementById('main_play_btn');
      MAIN_THUMB_BUFF = document.getElementById('thumb_buffering');
      MAIN_CURRENT_TIME.innerHTML = convertTime(MAIN_PLAYER.currentTime);
      this.$state.addStateListener(ACTIVE_PODCAST, this.methods.activePodcastState);
      this.methods.activePodcastState(this.$state.getState(ACTIVE_PODCAST));
      this.$state.addStateListener(ACTIVE_EPISODE, this.methods.activeEpisodeState);
      this.methods.activeEpisodeState(this.$state.getState(ACTIVE_EPISODE));
      MAIN_PLAYER.addEventListener('loadedmetadata', this.methods.onloadedmetadata);
      MAIN_PLAYER.addEventListener('timeupdate', this.methods.ontimeupdate);
      MAIN_PLAYER.addEventListener('pause', this.methods.onpause);
      MAIN_PLAYER.addEventListener('play', this.methods.onplay);
      MAIN_PLAYER.addEventListener('seeking', this.methods.onseeking);
      MAIN_PLAYER.addEventListener('seeked', this.methods.onseeked);
      MAIN_PLAYER.addEventListener('ratechange', this.methods.onratechange);
      MAIN_PLAYER.addEventListener('error', this.methods.onerror);
      document.addEventListener('keydown', this.methods.onKeydown);
      MAIN_DURATION.innerHTML = convertTime(MAIN_PLAYER.duration);
      MAIN_DURATION_SLIDER.value = MAIN_PLAYER.currentTime;
      MAIN_DURATION_SLIDER.setAttribute("max", MAIN_PLAYER.duration);
      this.methods.togglePlayIcon();
      this.methods.onratechange();
      if (this.$state.getState(AUTOPLAY) && BOOT == false && this.$state.getState(ACTIVE_PODCAST) && this.$state.getState(ACTIVE_EPISODE)) {
        this.methods.resumePodcast();
      }
      BOOT = true;
    },
    unmounted: function() {
      this.$state.removeStateListener(ACTIVE_PODCAST, this.methods.activePodcastState);
      this.$state.removeStateListener(ACTIVE_EPISODE, this.methods.activeEpisodeState);
      MAIN_PLAYER.removeEventListener('loadedmetadata', this.methods.onloadedmetadata);
      MAIN_PLAYER.removeEventListener('timeupdate', this.methods.ontimeupdate);
      MAIN_PLAYER.removeEventListener('pause', this.methods.onpause);
      MAIN_PLAYER.removeEventListener('play', this.methods.onplay);
      MAIN_PLAYER.removeEventListener('seeking', this.methods.onseeking);
      MAIN_PLAYER.removeEventListener('seeked', this.methods.onseeked);
      MAIN_PLAYER.removeEventListener('ratechange', this.methods.onratechange);
      MAIN_PLAYER.addEventListener('error', this.methods.onerror);
      document.removeEventListener('keydown', this.methods.onKeydown);
    },
    methods: {
      activePodcastState: function(podcastId) {
        const img = MAIN_THUMB;
        if (img == null)
          return;
        MAIN_THUMB_BUFF.style.visibility = 'visible';
        if (podcastId == null || podcastId == false) {
          MAIN_THUMB_BUFF.style.visibility = 'hidden';
          img.src = '/icons/icon112x112.png';
          return;
        }
        img.onload = () => {
          if (img.complete)
            MAIN_THUMB_BUFF.style.visibility = 'hidden';
        }
        T_PODCASTS.getItem(podcastId.toString())
        .then((podcast) => {
          if (podcast['image'] == null || podcast['image'] == '')
            podcast['image'] = '/icons/icon112x112.png';
          getThumb(podcast['image'])
          .then((url) => {
            img.src = url;
          })
          .catch((err) => {
            console.log(err);
          });
        });
      },
      activeEpisodeState: function(episodeId) {
        const title = MAIN_TITLE;
        if (title == null)
          return;
        if (episodeId == null || episodeId == false) {
          title.textContent = 'PodKast';
          return;
        }
        T_EPISODES.getItem(this.$state.getState(ACTIVE_PODCAST).toString())
        .then((episodes) => {
          if (episodes != null) {
            title.textContent = episodes[this.$state.getState(ACTIVE_EPISODE)].title
          }
        });
      },
      onloadedmetadata: function(evt) {
        MAIN_DURATION.innerHTML = convertTime(evt.target.duration);
        MAIN_DURATION_SLIDER.setAttribute("max", evt.target.duration);
      },
      ontimeupdate: function(evt) {
        MAIN_CURRENT_TIME.innerHTML = convertTime(evt.target.currentTime);
        MAIN_DURATION.innerHTML = convertTime(evt.target.duration);
        MAIN_DURATION_SLIDER.value = evt.target.currentTime;
        MAIN_DURATION_SLIDER.setAttribute("max", evt.target.duration);
        MAIN_PLAY_BTN.src = '/icons/pause.png';
        //if (MAIN_PLAYER.buffered.length > 0) {
        //  console.log("Start: " + MAIN_PLAYER.buffered.start(0) + " End: "  + MAIN_PLAYER.buffered.end(MAIN_PLAYER.buffered.length - 1));
        //}
      },
      onpause: function() {
        MAIN_PLAY_BTN.src = '/icons/play.png';
      },
      onplay: function() {
        MAIN_PLAY_BTN.src = '/icons/pause.png';
      },
      onseeking: function(evt) {
        MAIN_THUMB_BUFF.style.visibility = 'visible';
        MAIN_CURRENT_TIME.innerHTML = convertTime(evt.target.currentTime);
        MAIN_DURATION_SLIDER.value = evt.target.currentTime;
      },
      onseeked: function(evt) {
        MAIN_THUMB_BUFF.style.visibility = 'hidden';
      },
      onratechange: function() {
        this.$router.setSoftKeyCenterText(`${MAIN_PLAYER.playbackRate}x`);
      },
      onerror: function (evt) {
        this.$router.showToast(evt.toString());
      },
      onKeydown: function(evt) {
        if (MAIN_PLAYER.duration <= 0)
          return;
        switch(evt.key) {
          case 'Call':
            MAIN_PLAYER.fastSeek(0);
            break;
          case '1':
            var time = MAIN_PLAYER.currentTime - 30;
            if (time <= 0)
              time = 0;
            MAIN_PLAYER.fastSeek(time);
            break;
          case '3':
            var time = MAIN_PLAYER.currentTime + 30;
            if (time >= MAIN_PLAYER.duration)
              time = MAIN_PLAYER.duration;
            MAIN_PLAYER.fastSeek(time);
            break;
          case '4':
            var time = MAIN_PLAYER.currentTime - 60;
            if (time <= 0)
              time = 0;
            MAIN_PLAYER.fastSeek(time);
            break;
          case '6':
            var time = MAIN_PLAYER.currentTime + 60;
            if (time >= MAIN_PLAYER.duration)
              time = MAIN_PLAYER.duration;
            MAIN_PLAYER.fastSeek(time);
            break;
          case '7':
            var time = MAIN_PLAYER.currentTime - (0.01 * MAIN_PLAYER.duration);
            if (time <= 0)
              time = 0;
            MAIN_PLAYER.fastSeek(time);
            break;
          case '9':
            var time = MAIN_PLAYER.currentTime + (0.01 * MAIN_PLAYER.duration);
            if (time >= MAIN_PLAYER.duration)
              time = MAIN_PLAYER.duration;
            MAIN_PLAYER.fastSeek(time);
            break;
          case '2':
            if (MAIN_PLAYER.playbackRate >= 4)
              return
            MAIN_PLAYER.playbackRate += 0.25;
            break;
          case '5':
            MAIN_PLAYER.playbackRate = 1;
            break;
          case '8':
            if (MAIN_PLAYER.playbackRate <= 0.5)
              return
            MAIN_PLAYER.playbackRate -= 0.25;
            break;
        }
      },
      togglePlayIcon: function() {
        if (MAIN_PLAYER.duration > 0 && !MAIN_PLAYER.paused) {
          MAIN_PLAY_BTN.src = '/icons/pause.png';
        } else {
          MAIN_PLAY_BTN.src = '/icons/play.png';
        }
      },
      resumePodcast: function() {
        T_EPISODES.getItem(this.$state.getState(ACTIVE_PODCAST).toString())
        .then((episodes) => {
          if (episodes != null) {
            playPodcast(this.$router, JSON.parse(JSON.stringify(episodes[this.$state.getState(ACTIVE_EPISODE)])));
          }
        });
      },
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
      left: function() {
        if ([null, false].indexOf(this.$state.getState(ACTIVE_PODCAST)) > -1 || [null, false].indexOf(this.$state.getState(ACTIVE_EPISODE)) > -1)
          return;
        T_EPISODES.getItem(this.$state.getState(ACTIVE_PODCAST).toString())
        .then((episodes) => {
          if (episodes != null) {
            var temp = [];
            for (var x in episodes) {
              temp.push(episodes[x]);
            }
            temp.sort((a, b) => b.date - a.date);
            episodeListPage(this.$router, 'Main Player', temp, {}, this.$state.getState(ACTIVE_EPISODE));
          }
        });
      },
      center: function() {
        if ([null, false].indexOf(this.$state.getState(ACTIVE_PODCAST)) > -1 || [null, false].indexOf(this.$state.getState(ACTIVE_EPISODE)) > -1)
          return;
        if (MAIN_PLAYER.src == '' && this.$state.getState(ACTIVE_PODCAST) && this.$state.getState(ACTIVE_EPISODE)) {
          this.methods.resumePodcast();
          return;
        }
        if (MAIN_PLAYER.duration > 0 && !MAIN_PLAYER.paused) {
          MAIN_PLAYER.pause();
        } else {
          MAIN_PLAYER.play();
        }
      },
      right: function() {
        var menu = [
          {'text': 'Trending Podcast'},
          {'text': 'Subscribed Podcasts'}, // CACHE
          {'text': 'Search Podcast'},
          {'text': 'Recent Podcast'},
          {'text': 'Recent Podcast By Category'},
          {'text': 'Favorite Episodes'}, // CACHE
          {'text': 'Settings'},
          {'text': 'Help & Support'},
          {'text': 'Changelogs'},
          {'text': 'Exit'},
        ]
        this.$router.showOptionMenu('Menu', menu, 'SELECT', (selected) => {
          switch (selected.text) {
            case 'Trending Podcast':
              this.$router.showLoading();
              podcastIndex.getTrending()
              .then((result) => {
                podcastListPage(this.$router, selected.text, result.response.feeds);
              })
              .catch((err) => {
                console.log(err);
                $router.showToast('Network Error');
              })
              .finally(() => {
                this.$router.hideLoading();
              });
              break;
            case 'Subscribed Podcasts':
              podcastListPage(this.$router, selected.text, null);
              break;
            case 'Search Podcast':
              setTimeout(() => {
                const menu = [{'text': 'Search Podcasts'}, {'text': 'Search Podcasts by Title'}];
                this.$router.showOptionMenu('Search', menu, 'SELECT', (selected) => {
                  switch (selected.text) {
                    case 'Search Podcasts':
                      this.methods.showInputDialog(selected.text, 'Enter search term', (term) => {
                        this.$router.showLoading();
                        podcastIndex.searchByTerm(term)
                        .then((result) => {
                          podcastListPage(this.$router, selected.text, result.response.feeds);
                        })
                        .catch((err) => {
                          console.log(err);
                        })
                        .finally(() => {
                          $router.showToast('Network Error');
                          this.$router.hideLoading();
                        });
                      });
                      break;
                    case 'Search Podcasts by Title':
                      this.methods.showInputDialog(selected.text, 'Enter search term', (term) => {
                        this.$router.showLoading();
                        podcastIndex.searchByTitle(term)
                        .then((result) => {
                          podcastListPage(this.$router, selected.text, result.response.feeds);
                        })
                        .catch((err) => {
                          $router.showToast('Network Error');
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
            case 'Recent Podcast':
              setTimeout(() => {
                this.$router.showOptionMenu('Filter Recent Podcast By', [{'text': 'Show All'}, {'text': 'Categories'}], 'SELECT', (selected) => {
                  switch (selected.text) {
                    case 'Show All':
                      this.$router.showLoading();
                      podcastIndex.getRecentFeeds([])
                      .then((result) => {
                        podcastListPage(this.$router, "Recent Podcast", result.response.feeds);
                      })
                      .catch((err) => {
                        $router.showToast('Network Error');
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
                            podcastListPage(this.$router, "Recent Podcast", result.response.feeds);
                          })
                          .catch((err) => {
                            $router.showToast('Network Error');
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
                  podcastListPage(this.$router, selected.text, result.response.feeds);
                })
                .catch((err) => {
                  $router.showToast('Network Error');
                  console.log(err);
                })
                .finally(() => {
                  this.$router.hideLoading();
                });
              }, () => {});
              break;
            case 'Favorite Episodes':
              episodeListPage(this.$router, selected.text, null, {
                'Podcast Info': (episode) => {
                  this.$router.showLoading();
                  podcastIndex.getFeed(episode.feedId)
                  .then((result) => {
                    podcastListPage(this.$router, result.response.feed.title, [result.response.feed]);
                  })
                  .catch((err) => {
                    $router.showToast('Network Error');
                    console.log(err);
                  })
                  .finally(() => {
                    this.$router.hideLoading();
                  });
                },
              });
              break;
            case 'Settings':
              this.$router.push('settingPage');
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
        }, () => {
          setTimeout(() => {
            if (this.$router.stack[this.$router.stack.length - 1].name !== this.name)
              return;
            this.methods.onratechange();
          }, 100);
        });
      }
    },
    dPadNavListener: {
      arrowUp: function() {
        volumeUp(MAIN_PLAYER);
      },
      arrowRight: function() {
        MAIN_PLAYER.fastSeek(MAIN_PLAYER.currentTime + 10);
      },
      arrowDown: function() {
        volumeDown(MAIN_PLAYER);
      },
      arrowLeft: function() {
        MAIN_PLAYER.fastSeek(MAIN_PLAYER.currentTime - 10);
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
      'settingPage': {
        name: 'settingPage',
        component: settingPage
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

  document.addEventListener('visibilitychange', (evt) => {
    if (document.visibilityState === 'visible') {
      if (SLEEP_TIMER != null) {
        clearTimeout(SLEEP_TIMER);
        SLEEP_TIMER = null;
      }
    } else {
      if (state.getState(AUTOSLEEP) !== false && typeof state.getState(AUTOSLEEP) === 'number' && WAKE_LOCK == null) {
        SLEEP_TIMER = setTimeout(() => {
          window.close();
        }, state.getState(AUTOSLEEP) * 60 * 1000);
      }
    }
  });

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
