var BOOT = false;
var MAIN_DURATION_SLIDER;
var MAIN_CURRENT_TIME;
var MAIN_DURATION;
var MAIN_THUMB;
var MAIN_TITLE;
var MAIN_PLAY_BTN;
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
      // console.log('initTableBookmarked', TABLE_BOOKMARKED, temp);
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
        var tempPodcast = results[1];
        if (tempPodcast == null) {
          console.log('Podcast !Cached:', id);
          tempPodcast = {};
          tempPodcast['podkastCurrentEpisode'] = results[2][results[2].length - 1]['id'];
        }
        tempPodcast = Object.assign(tempPodcast, results[0].response.feed);
        var tempEpisodes = results[3];
        if (tempEpisodes == null) {
          tempEpisodes = {};
        }
        results[2].forEach((episode) => {
          if (tempEpisodes[episode['id']] == null) { // !CACHE
            console.log('Podcast Ep !Cached:', id, episode['id']);
            tempEpisodes[episode['id']] = {};
            tempEpisodes[episode['id']]['podkastLocalPath'] = false;
            tempEpisodes[episode['id']]['podkastLastDuration'] = 0;
          }
          tempEpisodes[episode['id']] = Object.assign(tempEpisodes[episode['id']], episode);
        });
        return Promise.all([T_PODCASTS.setItem(id.toString(), tempPodcast), T_EPISODES.setItem(id.toString(), tempEpisodes)]);
      })
      .then((saved) => {
        const result = {
          podcast: saved[0],
          episodes: saved[1],
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
        });
      }
    })
    .catch((err) => {
      console.log(err);
    });
  }

  const playPodcast = function($router, episode, playable = true) {
    // console.log(episode);
    state.setState(ACTIVE_PODCAST, episode['feedId']);
    localStorage.setItem(ACTIVE_PODCAST, episode['feedId']);
    state.setState(ACTIVE_EPISODE, episode['id']);
    localStorage.setItem(ACTIVE_EPISODE, episode['id']);
    // console.log(state.getState(ACTIVE_PODCAST), localStorage.getItem(ACTIVE_PODCAST));
    // console.log(state.getState(ACTIVE_EPISODE), localStorage.getItem(ACTIVE_EPISODE));
    // console.log(state.getState(ACTIVE_PODCAST), state.getState(ACTIVE_EPISODE), episode, playable);
    MINI_PLAYER.src = '';
    MINI_PLAYER.pause();
    MINI_PLAYER.currentTime = 0;
    MAIN_PLAYER.src = episode['enclosureUrl'];
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
  }

  const playEpisode = function($router, episode, playable = true, cb = () => {}) {
    delete episode['podkastTitle'];
    delete episode['podkastThumb'];
    delete episode['podkastBookmark'];
    delete episode['podkastPlaying'];
    delete episode['podkastCursor'];
    // console.log(episode);
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
        tempEpisode['podkastLastDuration'] = episode['podkastLastDuration'] || false;
      }
      tempEpisode = Object.assign(tempEpisode, episode);
      episodesObj[episode['id']] = tempEpisode;
      T_EPISODES.setItem(episode['feedId'].toString(), episodesObj);
      if (playable)
        miniPlayer(router, episodesObj[episode['id']], cb);
      return Promise.resolve(episodesObj[episode['id']]);
    })
    .catch((err) => {
      miniPlayer(router, episode, cb);
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
          const feedTitle = xml.getElementsByTagName("title");
          episodes.push({
            id: sha1(btoa(enclosureUrl + date.toString())),
            title: item.getElementsByTagName("title")[0].childNodes[0].nodeValue,
            description: desc.length > 0 ? desc[0].textContent.trim() : false,
            date: date,
            pubDate: item.getElementsByTagName("pubDate")[0].childNodes[0].nodeValue,
            enclosureUrl: enclosureUrl,
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
        console.log(err);
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
        // console.log('FROM HASH', id, thumbHash[id]);
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

  const settingPage = new Kai({
    name: 'setting',
    data: {
      title: 'setting',
      autoplay: false,
      autosleep: false,
    },
    verticalNavClass: '.settingNav',
    templateUrl: document.location.origin + '/templates/setting.html',
    mounted: function() {
      this.$router.setHeaderTitle('Settings');
      this.methods.listenState(this.$state.getState());
      this.$state.addGlobalListener(this.methods.listenState);
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
        }, () => {}, idx);
      },
      changeAutoPlay: function() {
        const value = !this.data.autoplay;
        localStorage.setItem(AUTOPLAY, value);
        this.$state.setState(AUTOPLAY, JSON.parse(localStorage.getItem(AUTOPLAY)));
      }
    },
    softKeyText: { left: '', center: 'SELECT', right: '' },
    softKeyListener: {
      left: function() {},
      center: function() {
        const listNav = document.querySelectorAll(this.verticalNavClass);
        if (this.verticalNavIndex > -1) {
          if (listNav[this.verticalNavIndex]) {
            listNav[this.verticalNavIndex].click();
          }
        }
      },
      right: function() {}
    },
    dPadNavListener: {
      arrowUp: function() {
        this.navigateListNav(-1);
      },
      arrowDown: function() {
        this.navigateListNav(1);
      }
    }
  });

  const descriptionPage = function($router, data) {
    $router.push(
      new Kai({
        name: 'descriptionPage',
        data: {
          title: 'descriptionPage',
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
    const URL = 'https://www.audiocheck.net/Audio/audiocheck.net_C.ogg'; // episode['enclosureUrl']
    // console.log(episode);
    return new Promise((resolve, reject) => {
      var BAR, CUR, MAX;
      var start = 0;
      var loaded = 0;
      var req = new XMLHttpRequest({ mozSystem: true });
      req.open('GET', URL, true);
      req.responseType = 'moz-blob';

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
            BAR = document.getElementById('download_bar');
            CUR = document.getElementById('download_cur');
            MAX = document.getElementById('download_max');
            req.onprogress = this.methods.onprogress;
            req.onreadystatechange = this.methods.onreadystatechange;
            req.onerror = this.methods.onerror;
            start = new Date().getTime();
            req.send();
            setTimeout(() => {
              req.abort();
            }, 10000);
          },
          unmounted: function() {
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
                // console.log(`${readableFileSize(evt.loaded, true, 2)}/${readableFileSize(evt.total, true, 2)}, ${frag}, ${elapsed}ms, ${readableFileSize(speed, true)}S, ${percentComplete.toFixed(2)}%`);
                BAR.style.width = `${percentComplete.toFixed(2)}%`;
                CUR.innerHTML = `${readableFileSize(evt.loaded, true, 2)}`;
                $router.setSoftKeyCenterText(`${readableFileSize(Math.round(speed), true)}/s`);
                $router.setSoftKeyRightText(BAR.style.width);
                MAX.innerHTML = `${readableFileSize(evt.total, true, 2)}`;
              }
            },
            onreadystatechange: function(evt) {
              // console.log('onreadystatechange', evt.currentTarget.readyState, evt.currentTarget.response);
              if (evt.currentTarget.readyState === 4) {
                if (evt.currentTarget.status >= 200 && evt.currentTarget.status <= 399) {
                  const paths = URL.split('/');
                  const file = paths[paths.length - 1].split('.');
                  var localPath = ['podkast', 'cache', episode['feedId']];
                  if (DS.deviceStorage.storageName != '') {
                    localPath = [DS.deviceStorage.storageName, ...localPath];
                  }
                  // console.log(localPath, `${episode['id']}.${file[file.length - 1]}`, evt.currentTarget.status, evt.currentTarget.response);
                  DS.addFile(localPath, `${episode['id']}.${file[file.length - 1]}`, evt.currentTarget.response)
                  .then((file) => {
                    // console.log(file);
                    episode['podkastLocalPath'] = file.name;
                    $router.setSoftKeyCenterText('SUCCESS');
                    $router.setSoftKeyLeftText('Close');
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
            }
          },
          backKeyListener: function(evt) {
            return true;
          }
        })
      );
    });
  }

  const miniPlayer = function($router, episode, cb = () => {}) {
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
          if (episode['feedImage'] == null || episode['feedImage'] == '')
            episode['feedImage'] = '/icons/icon112x112.png';
          if (episode['image'] == null || episode['image'] == '')
            episode['image'] = episode['feedImage'];
          getThumb(episode['image'])
          .then((url) => {
            const img = document.getElementById('mini_thumb');
            if (img != null) {
              img.src = url;
            }
          })
          .catch((err) => {
            console.log(err);
          });
          setTimeout(() => {
            MAIN_PLAYER.pause();
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
          setTimeout(() => {
            cb();
            state.setState(TABLE_BOOKMARKED, state.getState(TABLE_BOOKMARKED));
          }, 100);
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
          gotoPage: function(cur) {
            this.setData({
              // init: false,
              list: this.data.pages[cur],
              pageCursor: cur,
            });
            // $router.showToast(`Page ${this.data.pageCursor + 1}/${this.data.pages.length}`);
            this.methods.optimize();
            this.methods.renderLeftKeyText();
          },
          listenState: function(updated) {
            // console.log('listenState', TABLE_BOOKMARKED, updated);
            if (data == null) {
              this.methods.processDataNull(updated);
            } else {
              this.methods.processData(updated);
            }
          },
          processData: function(bookmarkList) {
            //console.log('processData', TABLE_BOOKMARKED, bookmarkList);
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
              // console.log('CURSOR:',cursor, episodeId);
              const pages = [];
              const temp = JSON.parse(JSON.stringify(data));
              while (temp.length > 0) {
                pages.push(temp.splice(0, 20));
                if (this.data.init && ((episodeId != null && episodeId != false) || cursor)) {
                  const matchId = episodeId || cursor;
                  // console.log('matchId:', matchId);
                  pages[pages.length - 1].forEach((ep, idx) => {
                    if (ep['id'] === matchId) {
                      // console.log(pages.length - 1, idx, pages[pages.length - 1][idx]['podkastCursor']);
                      pages[pages.length - 1][idx]['podkastCursor'] = true;
                      // this.data.init = false;
                      this.data.pageCursor = pages.length - 1;
                      this.verticalNavIndex = idx;
                    }
                  });
                }
              }
              // console.log(pages);
              this.data.pages = pages;
              this.methods.gotoPage(this.data.pageCursor);
              //this.setData({ list: data });
            });
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
              // console.log('Updated', result);
              playEpisode($router, result, false)
              .then((saved) => {
                // console.log('Saved:', saved);
                for (var x in this.data.pages[this.data.pageCursor]) {
                  if (this.data.pages[this.data.pageCursor][x]['id'] === episode['id']) {
                    this.data.pages[this.data.pageCursor][x]['podkastLocalPath'] = episode['podkastLocalPath'];
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
            // console.log('Delete:', episode['podkastLocalPath'], path);
            const name = path.pop();
            // console.log(path, name);
            DS.deleteFile(path, name, true)
            .then((result) => {
              // console.log('Deleted: ', result);
              episode['podkastLocalPath'] = false;
              return playEpisode($router, episode, false);
            })
            .then((saved) => {
              // console.log('Saved:', saved);
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
            // console.log(this.data.list[this.verticalNavIndex].description);
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
          $router.setHeaderTitle(title);
          const subscribedList = state.getState(TABLE_SUBSCRIBED);
          if (data == null) {
            this.methods.processDataNull(subscribedList);
          } else {
            this.methods.processData(subscribedList);
          }
          state.addStateListener(TABLE_SUBSCRIBED, this.methods.listenState);
        },
        unmounted: function() {
          state.removeStateListener(TABLE_SUBSCRIBED, this.methods.listenState);
        },
        methods: {
          listenState: function(updated) {
            // console.log('listenState', TABLE_SUBSCRIBED, updated);
            if (data == null) {
              this.methods.processDataNull(updated);
            } else {
              this.methods.processData(updated);
            }
          },
          processData: function(subscribedList) {
            // console.log('processData', TABLE_SUBSCRIBED, subscribedList);
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
            // console.log(subscribedList);
            if (subscribedList.length === 0) {
              this.setData({ list: [] });
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
        softKeyText: { left: 'Description', center: 'LISTEN', right: 'More' },
        softKeyListener: {
          left: function() {
            if (this.data.list[this.verticalNavIndex] == null)
              return;
            // console.log(this.data.list[this.verticalNavIndex]);
            descriptionPage($router, this.data.list[this.verticalNavIndex]);
          },
          center: function() {
            if (this.data.list[this.verticalNavIndex] == null)
              return;
            // console.log(this.data.list[this.verticalNavIndex]);
            const podcast = JSON.parse(JSON.stringify(this.data.list[this.verticalNavIndex]));
            if (MAIN_PLAYER.duration > 0 && !MAIN_PLAYER.paused && state.getState(ACTIVE_PODCAST).toString() === podcast['id'].toString())
              return;
            listenPodcast($router, podcast);
          },
          right: function() {
            if (this.data.list[this.verticalNavIndex] == null)
              return;
            const menu = [
              { 'text': 'Episode List' },
              { 'text': this.data.list[this.verticalNavIndex]['podkastSubscribe'] ? 'Unsubscribe' : 'Subscribe' }
            ];
            if (this.data.list[this.verticalNavIndex]['podkastSubscribe'])
              menu.push({ 'text': 'Sync Podcast' });
            $router.showOptionMenu('More', menu, 'SELECT', (selected) => {
              if (['Unsubscribe', 'Subscribe'].indexOf(selected.text) > -1) {
                subscribePodcast($router, this.data.list[this.verticalNavIndex]);
              } else if (selected.text === 'Episode List') {
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
                  })
                  .finally(() => {
                    $router.hideLoading();
                  });
                }
              } else if (selected.text === 'Sync Podcast') {
                syncPodcast(this.$router, this.data.list[this.verticalNavIndex])
                .then((result) => {
                  console.log(result.episodes[result.podcast['podkastCurrentEpisode']]);
                })
                .catch((err) => {
                  console.log(err);
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
      MAIN_CURRENT_TIME.innerHTML = convertTime(MAIN_PLAYER.currentTime);
      this.$state.addStateListener(ACTIVE_PODCAST, this.methods.activePodcastState);
      this.methods.activePodcastState(this.$state.getState(ACTIVE_PODCAST));
      this.$state.addStateListener(ACTIVE_EPISODE, this.methods.ActiveEpisodeState);
      this.methods.ActiveEpisodeState(this.$state.getState(ACTIVE_EPISODE));
      MAIN_PLAYER.addEventListener('loadedmetadata', this.methods.onloadedmetadata);
      MAIN_PLAYER.addEventListener('timeupdate', this.methods.ontimeupdate);
      MAIN_PLAYER.addEventListener('pause', this.methods.onpause);
      MAIN_PLAYER.addEventListener('play', this.methods.onplay);
      MAIN_PLAYER.addEventListener('seeking', this.methods.onseeking);
      MAIN_PLAYER.addEventListener('seeked', this.methods.onseeked);
      MAIN_DURATION.innerHTML = convertTime(MAIN_PLAYER.duration);
      MAIN_DURATION_SLIDER.value = MAIN_PLAYER.currentTime;
      MAIN_DURATION_SLIDER.setAttribute("max", MAIN_PLAYER.duration);
      this.methods.togglePlayIcon();
      if (this.$state.getState(AUTOPLAY) && BOOT == false && this.$state.getState(ACTIVE_PODCAST) && this.$state.getState(ACTIVE_EPISODE)) {
        this.methods.resumePodcast();
      }
      BOOT = true;
    },
    unmounted: function() {
      this.$state.removeStateListener(ACTIVE_PODCAST, this.methods.activePodcastState);
      this.$state.removeStateListener(ACTIVE_EPISODE, this.methods.ActiveEpisodeState);
      MAIN_PLAYER.removeEventListener('loadedmetadata', this.methods.onloadedmetadata);
      MAIN_PLAYER.removeEventListener('timeupdate', this.methods.ontimeupdate);
      MAIN_PLAYER.removeEventListener('pause', this.methods.onpause);
      MAIN_PLAYER.removeEventListener('play', this.methods.onplay);
      MAIN_PLAYER.removeEventListener('seeking', this.methods.onseeking);
      MAIN_PLAYER.removeEventListener('seeked', this.methods.onseeked);
    },
    methods: {
      activePodcastState: function(podcastId) {
        const img = MAIN_THUMB;
        if (img == null)
          return;
        if (podcastId == null || podcastId == false) {
          img.src = '/icons/icon112x112.png';
          return;
        }
        img.src = '/icons/loading.gif';
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
      ActiveEpisodeState: function(episodeId) {
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
        if (MAIN_PLAYER.buffered.length > 0) {
          console.log("Start: " + MAIN_PLAYER.buffered.start(0) + " End: "  + MAIN_PLAYER.buffered.end(MAIN_PLAYER.buffered.length - 1));
        }
      },
      onpause: function() {
        MAIN_PLAY_BTN.src = '/icons/play.png';
      },
      onplay: function() {
        MAIN_PLAY_BTN.src = '/icons/pause.png';
      },
      onseeking: function(evt) {
        console.log('start onseeking', evt.target.currentTime);
        MAIN_CURRENT_TIME.innerHTML = convertTime(evt.target.currentTime);
        MAIN_DURATION_SLIDER.value = evt.target.currentTime;
      },
      onseeked: function(evt) {
        console.log('end onseeked', evt.target.currentTime);
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
        // console.log(this.$state.getState(ACTIVE_PODCAST), this.$state.getState(ACTIVE_EPISODE));
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
        // console.log(this.$state.getState(ACTIVE_PODCAST), this.$state.getState(ACTIVE_EPISODE));
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
                  // console.log(selected.text, 'Podcast Info', episode.feedId);
                  this.$router.showLoading();
                  podcastIndex.getFeed(episode.feedId)
                  .then((result) => {
                    podcastListPage(this.$router, result.response.feed.title, [result.response.feed]);
                  })
                  .catch((err) => {
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
        }, () => {});
      }
    },
    dPadNavListener: {
      arrowUp: function() {
        volumeUp(MAIN_PLAYER);
      },
      arrowRight: function() {
        MAIN_PLAYER.fastSeek(MAIN_PLAYER.currentTime + 60);
      },
      arrowDown: function() {
        volumeDown(MAIN_PLAYER);
      },
      arrowLeft: function() {
        MAIN_PLAYER.fastSeek(MAIN_PLAYER.currentTime - 60);
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
