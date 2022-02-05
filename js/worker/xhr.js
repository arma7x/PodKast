console.log('XHR WORKER');
self.importScripts('/js/sha1.min.js');

self.onmessage = function(e) {
  try {
    var xhr = new XMLHttpRequest({ mozSystem: true });
    xhr.open('GET', e.data, false);
    xhr.responseType = 'blob';
    xhr.send();
    self.postMessage(xhr.response);
  } catch(e) {
    console.log(e);
    self.postMessage(e);
  }
}
