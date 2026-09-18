import postgres from "postgres";

const url=process.env.DATABASE_URL;
if(!url)throw new Error("DATABASE_URL이 필요합니다.");
const sql=postgres(url,{prepare:false});
const topics=["보고","일정","마감","야근","메신저","피드백","회의","자료","실수","확인"];
const features=["TRANSLATE","CHAT","PERSONA_REBUILD","MONOLOGUE"];
const rankGaps=["0","1","2","3단계+"];
const ageGaps=["0~5년","6~10년","11~20년","20년+"];
for(let index=0;index<500;index++){
  const subject=`demo-subject-${index%84}`;const occurred=new Date(Date.now()-Math.floor(Math.random()*30*86_400_000));const selected=[topics[index%topics.length]!,topics[(index*3+2)%topics.length]!];
  await sql`insert into analytics_events(anonymous_subject_hash,event_type,feature,occurred_at,user_age_band,boss_age_band,rank_gap_bucket,age_gap_bucket,topic_keywords,persona_confidence_bucket,is_demo,expires_at)
    values(${subject},'AI_REQUEST',${features[index%features.length]},${occurred.toISOString()},${[20,30,40,50][index%4]},${[30,40,50,60][index%4]},${rankGaps[index%rankGaps.length]},${ageGaps[index%ageGaps.length]},${selected},${["LOW","MEDIUM","HIGH"][index%3]},true,now()+interval '31 days')`;
}
await sql.end();
console.log("500개의 익명 HR 데모 이벤트를 생성했습니다.");
