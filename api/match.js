// MANDO SPORT — detailed football match centre using ESPN event summaries.
const LEAGUES={PL:"eng.1",PD:"esp.1",SA:"ita.1",BL1:"ger.1",FL1:"fra.1",CL:"uefa.champions",SPL:"ksa.1",MLS:"usa.1"};
module.exports=async function handler(req,res){
 const id=typeof req.query.id==="string"?req.query.id.trim():"";
 const code=typeof req.query.competition==="string"?req.query.competition.toUpperCase():"PL";
 const league=LEAGUES[code];
 if(!/^\d{5,}$/.test(id)||!league)return res.status(400).json({error:"بيانات المباراة غير صحيحة."});
 try{
  const response=await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/"+league+"/summary?event="+encodeURIComponent(id),{headers:{"User-Agent":"MANDO-SPORT/2.0","Accept":"application/json"}});
  if(!response.ok)throw new Error("ESPN HTTP "+response.status);
  const data=await response.json();
  const header=data.header||{},competition=(header.competitions||[])[0]||{},competitors=competition.competitors||[];
  const team=side=>{const item=competitors.find(x=>x.homeAway===side)||{};return {id:item.team?.id||"",name:item.team?.displayName||item.team?.shortDisplayName||"فريق",logo:item.team?.logo||item.team?.logos?.[0]?.href||"",score:item.score??null,form:item.records?.[0]?.summary||""};};
  const status=competition.status?.type||header.competitions?.[0]?.status?.type||{};
  const statistics=(data.boxscore?.teams||[]).map(item=>({team:item.team?.displayName||item.team?.shortDisplayName||"",statistics:(item.statistics||[]).map(stat=>({name:stat.label||stat.name||stat.displayName||"",value:stat.displayValue??stat.value??""}))}));
  const rawPlays=Array.isArray(data.plays)?data.plays:(data.plays?.items||[]);
  const events=rawPlays.slice(-30).map(play=>({text:play.text||play.shortText||play.type?.text||"",clock:play.clock?.displayValue||play.clock||"",period:play.period?.number||play.period||"",team:play.team?.displayName||""})).filter(play=>play.text);
  const rosterSource=Array.isArray(data.rosters)?data.rosters:[];
  const lineups=["home","away"].map(side=>{
   const item=rosterSource.find(x=>x.team?.id===team(side).id)||rosterSource.find(x=>x.homeAway===side)||{};
   const raw=Array.isArray(item.roster)?item.roster:Array.isArray(item.players)?item.players:[];
   const players=raw.map(p=>{
    const a=p.athlete||p.player||p;
    const pos=p.position||a.position||{};
    return {id:a.id||"",name:a.displayName||a.fullName||a.shortName||"",number:p.jersey??p.jerseyNumber??a.jersey??"",position:pos.displayName||pos.name||pos.abbreviation||"",positionCode:pos.abbreviation||pos.name||"",photo:a.headshot?.href||a.photo||"",starter:p.starter===true||p.starter?.displayValue==="Starter"||p.type?.name==="Starter",captain:p.captain===true};
   }).filter(p=>p.name);
   return {side,team:team(side).name,formation:item.formation||item.team?.formation||"",starters:players.filter(p=>p.starter),substitutes:players.filter(p=>!p.starter)};
  });
  const leaders=(data.leaders||[]).flatMap(group=>(group.leaders||[]).map(item=>({name:group.displayName||group.name||"",player:item.athlete?.displayName||"",value:item.displayValue||item.value||""}))).slice(0,12);
  const venue=data.gameInfo?.venue||competition.venue||{};
  res.setHeader("Cache-Control","s-maxage=90, stale-while-revalidate=180");
  return res.status(200).json({provider:"ESPN",updatedAt:new Date().toISOString(),lineups,match:{id,name:header.name||competition.name||"",date:competition.date||header.date||"",status:status.description||status.detail||status.name||"",state:status.state||"",home:team("home"),away:team("away"),competition:header.league?.name||"",venue:venue.fullName||"",city:venue.address?.city||"",attendance:data.gameInfo?.attendance||null},statistics,events,leaders,articles:(data.articles||[]).slice(0,5).map(a=>({title:a.headline||a.title||"",url:a.links?.web?.href||""})).filter(a=>a.title&&a.url)});
 }catch(error){return res.status(502).json({error:"تعذر تحميل تفاصيل المباراة حالياً."});}
};
