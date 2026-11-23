const CACHE='mando-customers-v1';
const SHELL=['/customers.html','/manifest.webmanifest','/mando-icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(request.mode==='navigate'&&url.pathname==='/customers.html'){
  event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));return response;}).catch(()=>caches.match('/customers.html')));
 }
});
self.addEventListener('push',event=>{
  let data={};try{data=event.data?event.data.json():{};}catch(e){data={body:event.data?.text()||''};}
  const title=data.title||'MANDO SPORT';
  const options={body:data.body||'يوجد تحديث جديد للمباريات',icon:'/mando-icon.svg',badge:'/mando-icon.svg',tag:data.tag||'mando-sport-update',renotify:true,data:{url:data.url||'https://mando-sport-live.vercel.app/#matches'}};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();const target=event.notification.data?.url||'/#matches';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){if('focus' in client){client.navigate(target);return client.focus();}}
    return clients.openWindow(target);
  }));
});
