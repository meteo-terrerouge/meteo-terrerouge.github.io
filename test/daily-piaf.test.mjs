import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyRows, dailyRainBars, dailyRainDisplayBars, dailyChartMarkup, dailyRainScale } from '../public/daily-rows.js';
const HOUR=3600000, MINUTE=60000;
const now=Date.parse('2026-11-06T12:00:00Z');
const piaf=(start=now,amount=.1)=>({coverageId:'RAIN___'+new Date(start).toISOString().slice(0,19).replaceAll(':','.')+'Z_PT5M',fetchedAt:start,values:Array.from({length:36},(_,index)=>({seconds:(index+1)*300,precipitation:amount}))});
const dashboard=(start=now,extra={})=>({piaf:piaf(start),arome:{fetchedAt:start,hours:Array.from({length:30},(_,index)=>({time:new Date(start+(index+1)*HOUR).toISOString(),temperature:8,rain:9,liquidRain:9,snowfall:0,...extra}))}});
const chartDay=day=>({...day,rainIntervals:day.chartRainIntervals});
const sum=bars=>bars.reduce((total,bar)=>total+bar.rain,0);
const close=(value,expected)=>assert.ok(Math.abs(value-expected)<1e-9,`${value} != ${expected}`);

test('la frise 24 h utilise les cumuls PIAF natifs seulement pendant les trois heures à venir',()=>{
  const data=dashboard(),before=structuredClone(data);
  const [day]=buildDailyRows({dashboard:data,now,piafForChart:true});
  const [baseline]=buildDailyRows({dashboard:data,now});
  assert.deepEqual(day.samples,baseline.samples,'températures, courbes et données des cartes conservées');
  const near=dailyRainBars(chartDay(day),now,now+3*HOUR);
  assert.equal(near.length,36);
  assert.ok(near.every(bar=>bar.source==='PIAF'));
  close(sum(near),3.6);
  near.forEach(bar=>close(bar.rain*HOUR/(bar.end-bar.start),1.2));
  close(sum(dailyRainBars(chartDay(day),now+3*HOUR,now+4*HOUR)),9);
  close(sum(dailyRainBars(day,now,now+3*HOUR)),27,'les cartes conservent leur scénario modèle');
  const html=dailyChartMarkup(day,{now,width:1800});
  assert.ok(html.includes('data-rain-source="PIAF"'));
  assert.ok(html.includes('mm sur 5 min'));
  assert.deepEqual(data,before);
});

test('le premier pas partiel et la fin réelle de PIAF ne sont ni multipliés ni prolongés',()=>{
  const current=now+2*MINUTE;
  const [day]=buildDailyRows({dashboard:dashboard(),now:current,piafForChart:true});
  close(sum(dailyRainBars(chartDay(day),current,now+3*HOUR)),3.56);
  const join=dailyRainBars(chartDay(day),now+3*HOUR,current+3*HOUR);
  assert.ok(join.every(bar=>bar.source==='AROME'));
  close(sum(join),9*2/60);
  close(sum(dailyRainBars(chartDay(day),current+3*HOUR,now+4*HOUR)),9*58/60);
  assert.ok(!dailyChartMarkup(day,{now:current}).includes('day-rain-missing'));
  const continuous=dailyRainBars(chartDay(day),current,now+4*HOUR);
  continuous.slice(1).forEach((bar,index)=>assert.equal(bar.start,continuous[index].end));
});

test('PIAF absent, expiré ou troué laisse les modèles disponibles assurer la continuité',()=>{
  for(const change of [data=>{delete data.piaf;},data=>{data.piaf=piaf(now-4*HOUR);},data=>{data.piaf.values[4].precipitation=null;}]){
    const data=dashboard(); change(data);
    const [day]=buildDailyRows({dashboard:data,now,piafForChart:true});
    const near=dailyRainBars(chartDay(day),now,now+3*HOUR);
    close(near.reduce((duration,bar)=>duration+bar.end-bar.start,0),3*HOUR);
    assert.ok(near.some(bar=>bar.source==='AROME'));
    assert.ok(!dailyChartMarkup(day,{now}).includes('day-rain-missing'));
    near.slice(1).forEach((bar,index)=>assert.equal(bar.start,near[index].end));
  }
  const data=dashboard(); data.piaf=piaf(now,0);
  const [dry]=buildDailyRows({dashboard:data,now,piafForChart:true});
  close(sum(dailyRainBars(chartDay(dry),now,now+3*HOUR)),0);
  assert.ok(!dailyChartMarkup(dry,{now}).includes('day-rain-missing'));
});

test('un trou PIAF garde les cumuls natifs et ne reçoit que le fragment modèle manquant',()=>{
  const data=dashboard(); data.piaf.values[4].precipitation=null;
  const [day]=buildDailyRows({dashboard:data,now,piafForChart:true});
  const bars=dailyRainBars(chartDay(day),now,now+3*HOUR);
  close(sum(bars.filter(bar=>bar.source==='PIAF')),3.5);
  close(sum(bars.filter(bar=>bar.source==='AROME')),.75);
  close(sum(bars),4.25);
});

test('une absence commune à toutes les sources reste inconnue sans cumul inventé',()=>{
  const data=dashboard(now,{rain:null,liquidRain:null,snowfall:null});
  data.piaf.values[4].precipitation=null;
  const [day]=buildDailyRows({dashboard:data,now,piafForChart:true});
  const bars=dailyRainBars(chartDay(day),now+20*MINUTE,now+25*MINUTE);
  assert.equal(bars.length,0);
  const html=dailyChartMarkup(day,{now});
  const indicators=html.match(/<g class="chart-point day-rain-missing".*?<\/g>/g);
  assert.equal(indicators.length,1);
  assert.ok(indicators[0].includes('Précipitations indisponibles'));
  assert.ok(indicators[0].includes('<line '));
  assert.ok(!/<(?:rect|path|polygon|text)\b/.test(indicators[0]),'une donnée pluie absente ne masque aucune courbe');
  const baseline=Number(indicators[0].match(/y1="([\d.]+)"/)[1]);
  const height=Number(html.match(/viewBox="0 0 \d+ (\d+)"/)[1]);
  assert.equal(baseline,height-2,'repère cantonné au bas du graphique');
  const [original]=buildDailyRows({dashboard:data,now});
  assert.deepEqual(day.samples,original.samples,'les autres données sont inchangées même sans précipitations');
});

test('le cumul PIAF reste en mm malgré la neige en cm, et le regroupement conserve le total',()=>{
  const [day]=buildDailyRows({dashboard:dashboard(now,{rain:9,liquidRain:0,snowfall:2,weatherCode:73}),now,piafForChart:true});
  const bars=dailyRainBars(chartDay(day),now,now+3*HOUR);
  close(sum(bars),3.6);
  close(bars.reduce((total,bar)=>total+bar.snowfall,0),6);
  assert.ok(bars.every(bar=>bar.source==='PIAF'&&bar.snowSource==='AROME'));
  for(const width of [280,1800])close(sum(dailyRainDisplayBars(chartDay(day),width,now,now+3*HOUR)),3.6);
  assert.ok(dailyChartMarkup(day,{now,width:1800}).includes('Neige fraîche estimée (AROME)'));
  assert.ok(dailyRainScale([day])>=10);
});

test('la fenêtre PIAF traverse minuit sans alimenter les heures passées ni le reste du lendemain',()=>{
  const current=Date.parse('2026-11-06T22:30:00Z');
  const days=buildDailyRows({dashboard:dashboard(current),now:current,piafForChart:true});
  const bars=days.flatMap(day=>dailyRainBars(chartDay(day),Math.max(day.start,current),Math.min(day.end,current+3*HOUR)));
  close(sum(bars),3.6);
  assert.ok(bars.every(bar=>bar.source==='PIAF'));
  const tomorrow=days.find(day=>day.date==='2026-11-07');
  assert.ok(dailyRainBars(chartDay(tomorrow),current+3*HOUR,current+4*HOUR).every(bar=>bar.source==='AROME'));
});
