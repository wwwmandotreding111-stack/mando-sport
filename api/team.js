// MANDO SPORT — football club profile, roster and recent fixtures.
const ALLOWED=["eng.1","esp.1","ita.1","ger.1","fra.1","uefa.champions","ksa.1","usa.1","fifa.world"];
async function get(url){const r=await fetch(url,{headers:{"User-Agent":"MANDO-SPORT/2.0","Accept":"application/json"}});if(!r.ok)throw new Error("ESPN HTTP "+r.status);return r.json();}
module.exports=async function handler(req,res){
 const id=typeof req.query.id==="string"?req.query.id:"",league=typeof req.query.league==="string"?req.query.league:"eng.1";
 if(!/^\d{1,10}$/.test(id)||!ALLOWED.includes(league))return res.status(400).json({error:"بيانات الفريق غير صحيحة."});
 try{
  const root="https://site.api.espn.com/apis/site/v2/sports/soccer/"+league+"/teams/"+id;
  const results=await Promise.allSettled([get(root),get(root+"/schedule"),get(root+"/roster")]);
  if(results[0].status!=="fulfilled")throw results[0].reason;
  const raw=results[0].value.team||results[0].value;
  const sched=results[1].status==="fulfilled"?results[1].value:{};
  const rosterData=results[2].status==="fulfilled"?results[2].value:{};
  const roster=[];
  const walk=v=>{if(!v)return;if(Array.isArray(v)){v.forEach(walk);return;}if(typeof v==="object"){if(v.id&& (v.fullName||v.displayName||v.firstName))roster.push(v);else Object.values(v).forEach(walk);}};
  walk(rosterData.athletes||rosterData.roster||[]);
  const events=(sched.events||[]).slice(0,20).map(e=>{const c=(e.competitions||[])[0]||{},teams=c.competitors||[];const h=teams.find(t=>t.homeAway==="home")||{},a=teams.find(t=>t.homeAway==="away")||{};return {id:e.id,date:e.date,name:e.name,status:e.status?.type?.description||e.status?.type?.name||"",home:h.team?.displayName||"",away:a.team?.displayName||"",homeScore:h.score??null,awayScore:a.score??null};});
  res.setHeader("Cache-Control","s-maxage=600, stale-while-revalidate=1200");
  return res.status(200).json({provider:"ESPN",team:{id:raw.id,name:raw.displayName||raw.name||"",shortName:raw.shortDisplayName||"",logo:raw.logos?.[0]?.href||raw.logo||"",nickname:raw.nickname||"",abbreviation:raw.abbreviation||"",description:raw.description||"",location:raw.location||"",color:raw.color||"",venue:raw.venue?.fullName||"",record:raw.record?.items?.[0]?.summary||raw.record?.summary||"",website:raw.links?.find(x=>(x.rel||[]).includes("clubhouse"))?.href||""},roster:roster.slice(0,40).map(p=>({id:p.id,name:p.fullName||p.displayName||[p.firstName,p.lastName].filter(Boolean).join(" "),position:p.position?.displayName||p.position?.name||"",number:p.jersey||"",image:p.headshot?.href||p.headshot||"",nationality:p.citizenship||p.nationality||""})),events,partial:results.slice(1).some(x=>x.status==="rejected")});
 }catch(e){return res.status(502).json({error:"تعذر تحميل صفحة الفريق حالياً."});}
};
