// MANDO SPORT — football player profile.
const ALLOWED=["eng.1","esp.1","ita.1","ger.1","fra.1","uefa.champions","ksa.1","usa.1","fifa.world"];
module.exports=async function handler(req,res){
 const id=typeof req.query.id==="string"?req.query.id:"",league=typeof req.query.league==="string"?req.query.league:"eng.1";
 if(!/^\d{1,10}$/.test(id)||!ALLOWED.includes(league))return res.status(400).json({error:"بيانات اللاعب غير صحيحة."});
 try{
  const url="https://site.api.espn.com/apis/site/v2/sports/soccer/"+league+"/athletes/"+id;
  const response=await fetch(url,{headers:{"User-Agent":"MANDO-SPORT/2.0","Accept":"application/json"}});
  if(!response.ok)throw new Error("ESPN HTTP "+response.status);
  const data=await response.json(),p=data.athlete||data;
  res.setHeader("Cache-Control","s-maxage=900, stale-while-revalidate=1800");
  return res.status(200).json({provider:"ESPN",player:{id:p.id,name:p.fullName||p.displayName||"",shortName:p.shortName||"",position:p.position?.displayName||p.position?.name||"",age:p.age||null,birthDate:p.dateOfBirth||"",birthPlace:[p.birthPlace?.city,p.birthPlace?.country].filter(Boolean).join(", "),nationality:p.citizenship||p.nationality||"",height:p.displayHeight||p.height||"",weight:p.displayWeight||p.weight||"",number:p.jersey||"",image:p.headshot?.href||p.headshot||"",team:p.team?.displayName||p.team?.name||"",teamLogo:p.team?.logos?.[0]?.href||"",college:p.college?.name||""}});
 }catch(e){return res.status(502).json({error:"تعذر تحميل صفحة اللاعب حالياً."});}
};
