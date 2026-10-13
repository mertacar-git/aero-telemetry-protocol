(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.AeroModels=api;})(globalThis,function(){
'use strict';
const finite=(values)=>{if(!values.every(Number.isFinite))throw Error('Inputs must be finite numbers.');};
const median=a=>{const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
function telemetry(rows,alt=120,bat=20){
  if(rows.length<2||rows.length>200000)throw Error('Provide 2–200,000 samples.');
  finite([alt,bat]);if(bat<0||bat>100)throw Error('Battery threshold must be 0–100.');
  const keys=['time_s','altitude_m','airspeed_ms','battery_pct'];
  rows=rows.map(row=>{const r={};for(const k of keys){if(row[k]===undefined||String(row[k]).trim()==='')throw Error('Missing value: '+k);r[k]=Number(row[k]);}finite(keys.map(k=>r[k]));if(r.airspeed_ms<0||r.battery_pct<0||r.battery_pct>100)throw Error('Invalid speed or battery.');return r;});
  const gaps=rows.slice(1).map((r,i)=>r.time_s-rows[i].time_s);if(gaps.some(g=>g<=0))throw Error('Time must strictly increase.');
  const typical=median(gaps);
  rows.forEach((r,i)=>{let gradient;if(i===0||i===rows.length-1){const a=i===0?0:i-1,b=a+1;gradient=(rows[b].altitude_m-rows[a].altitude_m)/(rows[b].time_s-rows[a].time_s);}else{const h1=r.time_s-rows[i-1].time_s,h2=rows[i+1].time_s-r.time_s;gradient=-h2/(h1*(h1+h2))*rows[i-1].altitude_m+(h2-h1)/(h1*h2)*r.altitude_m+h1/(h2*(h1+h2))*rows[i+1].altitude_m;}Object.assign(r,{vertical_speed_ms:gradient,altitude_alert:r.altitude_m>alt,battery_alert:r.battery_pct<bat,time_gap_alert:i>0&&gaps[i-1]>3*typical});});
  const duration=rows.at(-1).time_s-rows[0].time_s;
  const distance=rows.slice(1).reduce((sum,r,i)=>sum+(r.airspeed_ms+rows[i].airspeed_ms)/2*gaps[i],0);
  return {rows,summary:{duration_s:duration,air_distance_m:distance,mean_airspeed_ms:distance/duration,peak_altitude_m:Math.max(...rows.map(r=>r.altitude_m)),battery_used_pct:rows[0].battery_pct-rows.at(-1).battery_pct,altitude_alert_samples:rows.filter(r=>r.altitude_alert).length,battery_alert_samples:rows.filter(r=>r.battery_alert).length,time_gap_samples:rows.filter(r=>r.time_gap_alert).length}};
}
function flightDemo(){return Array.from({length:301},(_,t)=>({time_s:t,altitude_m:140*Math.sin(Math.PI*t/300)**2,airspeed_ms:18+3*Math.sin(t/20),battery_pct:100-0.29*t}));}
function pid({kp=1,ki=.1,kd=1.5,target=20,duration=40,dt=.02,gust=0}={}){
  finite([kp,ki,kd,target,duration,dt,gust]);if(Math.min(kp,ki,kd,target)<0||dt<.001||dt>.1||duration<dt||duration>120)throw Error('Invalid controller parameters.');
  let h=0,v=0,integral=0;const rows=[];
  for(let i=0;i<=Math.floor(duration/dt);i++){const t=i*dt,error=target-h,request=kp*error+ki*integral-kd*v,command=Math.max(-10,Math.min(10,request));rows.push({time_s:t,altitude_m:h,velocity_ms:v,command_ms2:command,error_m:error});if(Math.abs(request)<=10||error*request<0)integral+=error*dt;v+=(command-.3*v+(t>=10&&t<12?gust:0))*dt;h+=v*dt;}
  const tol=Math.max(Math.abs(target)*.02,.01),outside=rows.map((r,i)=>Math.abs(r.error_m)>tol?i:-1).filter(i=>i>=0),index=outside.length?outside.at(-1)+1:0;
  return {rows,summary:{overshoot_m:Math.max(0,...rows.map(r=>r.altitude_m-target)),final_error_m:rows.at(-1).error_m,settling_time_s:index<rows.length?rows[index].time_s:null,saturation_pct:100*rows.filter(r=>Math.abs(r.command_ms2)>=10).length/rows.length}};
}
const atmosphere=h=>[1.225*Math.exp(-Math.max(0,h)/8500),9.80665*(6371000/(6371000+Math.max(0,h)))**2];
function rocket({dry_mass_kg=1,propellant_kg=.25,thrust_n=35,burn_s=3,diameter_m=.08,drag_coefficient=.5,dt_s=.02,duration_s=120}={}){
  finite([dry_mass_kg,propellant_kg,thrust_n,burn_s,diameter_m,drag_coefficient,dt_s,duration_s]);
  if(dry_mass_kg<=0||propellant_kg<0||thrust_n<0||burn_s<=0||diameter_m<=0||drag_coefficient<0||dt_s<.005||dt_s>.1||duration_s>300||duration_s<=0)throw Error('Invalid rocket parameters.');
  const area=Math.PI*(diameter_m/2)**2,mass=t=>dry_mass_kg+propellant_kg*Math.max(0,1-t/burn_s),thrust=t=>t<burn_s?thrust_n:0;
  const derivative=(t,h,v)=>{const [rho,g]=atmosphere(h),force=thrust(t)-.5*rho*drag_coefficient*area*v*Math.abs(v)-mass(t)*g;return h<=0&&v<=0&&force<=0?[0,0]:[v,force/mass(t)];};
  let h=0,v=0,landed=false;const rows=[];
  for(let i=0;i<=Math.ceil(duration_s/dt_s);i++){
    let t=Math.min(i*dt_s,duration_s);const [rho]=atmosphere(h);rows.push({time_s:t,altitude_m:h,velocity_ms:v,mass_kg:mass(t),thrust_n:thrust(t),dynamic_pressure_pa:.5*rho*v*v,acceleration_ms2:derivative(t,h,v)[1]});if(t>=duration_s)break;
    const step=Math.min(dt_s,duration_s-t),segments=t<burn_s&&burn_s<t+step?[burn_s-t,t+step-burn_s]:[step];
    for(const s of segments){const end=t+s,endpoint=Math.abs(end-burn_s)<1e-10?end-Number.EPSILON*Math.max(1,Math.abs(end)):end;
      const a=derivative(t,h,v),b=derivative(t+s/2,h+a[0]*s/2,v+a[1]*s/2),c=derivative(t+s/2,h+b[0]*s/2,v+b[1]*s/2),d=derivative(endpoint,h+c[0]*s,v+c[1]*s);
      const hn=h+s*(a[0]+2*b[0]+2*c[0]+d[0])/6,vn=v+s*(a[1]+2*b[1]+2*c[1]+d[1])/6;
      if(h>0&&hn<=0){const f=h/(h-hn),vt=v+f*(vn-v),tt=t+s*f;rows.push({time_s:tt,altitude_m:0,velocity_ms:vt,mass_kg:mass(tt),thrust_n:0,dynamic_pressure_pa:.5*1.225*vt*vt,acceleration_ms2:0});landed=true;break;}
      h=Math.max(0,hn);v=hn>0?vn:0;t=end;
    }if(landed)break;
  }
  const apogee=rows.reduce((a,b)=>a.altitude_m>=b.altitude_m?a:b);
  return {rows,summary:{apogee_m:apogee.altitude_m,apogee_time_s:apogee.time_s,peak_speed_ms:Math.max(...rows.map(r=>Math.abs(r.velocity_ms))),max_q_pa:Math.max(...rows.map(r=>r.dynamic_pressure_pa)),landed,landing_time_s:landed?rows.at(-1).time_s:null}};
}
function wing({span_m=2,root_chord_m=.35,taper=.6,sweep_deg=0,efficiency=.8,cd0=.025,cl_max=1.2,mass_kg=2,speed_ms=20}={}){
  finite([span_m,root_chord_m,taper,sweep_deg,efficiency,cd0,cl_max,mass_kg,speed_ms]);if(span_m<=0||root_chord_m<=0||taper<.1||taper>1||efficiency<.1||efficiency>1||cd0<0||cl_max<=0||mass_kg<=0||speed_ms<=0)throw Error('Invalid wing inputs.');
  const area=span_m*root_chord_m*(1+taper)/2,ar=span_m**2/area,a0=2*Math.PI*Math.cos(sweep_deg*Math.PI/180),slope=a0/(1+a0/(Math.PI*efficiency*ar)),required=mass_kg*9.80665/(.5*1.225*speed_ms**2*area);
  const rows=Array.from({length:21},(_,i)=>{const alpha=i-5,cl=slope*alpha*Math.PI/180,cdi=cl**2/(Math.PI*efficiency*ar);return {alpha_deg:alpha,cl,cd:cd0+cdi,cdi,lift_n:.5*1.225*speed_ms**2*area*cl,drag_n:.5*1.225*speed_ms**2*area*(cd0+cdi),beyond_cl_max:Math.abs(cl)>cl_max};});
  const offset=Math.tan(sweep_deg*Math.PI/180)*span_m/2,tip=root_chord_m*taper;
  return {rows,planform:[[0,0],[span_m/2,offset],[span_m/2,offset+tip],[0,root_chord_m],[-span_m/2,offset+tip],[-span_m/2,offset],[0,0]],summary:{area_m2:area,aspect_ratio:ar,tip_chord_m:tip,mac_m:2*root_chord_m/3*(1+taper+taper*taper)/(1+taper),required_cl:required,required_alpha_deg:required/slope*180/Math.PI,estimated_stall_speed_ms:Math.sqrt(2*mass_kg*9.80665/(1.225*area*cl_max)),feasible_by_cl_limit:required<=cl_max}};
}
function naca4(code='2412',points=81){if(!/^\d{4}$/.test(code))throw Error('Use four NACA digits.');const m=Number(code[0])/100,p=Number(code[1])/10,t=Number(code.slice(2))/100;if(t<=0||t>.4||(m>0&&p===0))throw Error('Invalid NACA profile.');const upper=[],lower=[];for(let i=0;i<points;i++){const x=(1-Math.cos(Math.PI*i/(points-1)))/2,yt=5*t*(.2969*Math.sqrt(x)-.126*x-.3516*x*x+.2843*x**3-.1036*x**4);let yc=0,slope=0;if(m>0){if(x<p){yc=m/p**2*(2*p*x-x*x);slope=2*m/p**2*(p-x);}else{yc=m/(1-p)**2*((1-2*p)+2*p*x-x*x);slope=2*m/(1-p)**2*(p-x);}}const angle=Math.atan(slope);upper.push([x-yt*Math.sin(angle),yc+yt*Math.cos(angle)]);lower.push([x+yt*Math.sin(angle),yc-yt*Math.cos(angle)]);}return {upper,lower};}
function crc16(data){let crc=0xffff;for(const byte of data){crc^=byte<<8;for(let i=0;i<8;i++)crc=(crc&0x8000?(crc<<1)^0x1021:crc<<1)&0xffff;}return crc;}
function encode({sequence=42,timestamp_ms=1000,altitude_m=120,airspeed_ms=18,battery_pct=85}={}){
  finite([sequence,altitude_m,airspeed_ms,battery_pct]);if(!Number.isInteger(sequence)||sequence<0||sequence>0xffffffff||!Number.isSafeInteger(timestamp_ms)||timestamp_ms<0||airspeed_ms<0||battery_pct<0||battery_pct>100)throw Error('Invalid packet fields.');
  const bytes=new Uint8Array(32),v=new DataView(bytes.buffer);bytes.set([65,84,26,0,1,1]);v.setUint32(6,sequence,true);v.setBigUint64(10,BigInt(timestamp_ms),true);v.setFloat32(18,altitude_m,true);v.setFloat32(22,airspeed_ms,true);v.setFloat32(26,battery_pct,true);if(![v.getFloat32(18,true),v.getFloat32(22,true)].every(Number.isFinite))throw Error('Values must fit float32.');v.setUint16(30,crc16(bytes.slice(2,30)),true);return bytes;
}
function decode(bytes){if(bytes.length!==32||bytes[0]!==65||bytes[1]!==84)throw Error('Invalid magic or packet size.');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(v.getUint16(2,true)!==26)throw Error('Invalid body length.');if(crc16(bytes.slice(2,30))!==v.getUint16(30,true))throw Error('CRC mismatch.');if(bytes[4]!==1||bytes[5]!==1)throw Error('Unsupported version or message type.');const sample={sequence:v.getUint32(6,true),timestamp_ms:v.getBigUint64(10,true).toString(),altitude_m:v.getFloat32(18,true),airspeed_ms:v.getFloat32(22,true),battery_pct:v.getFloat32(26,true)};finite([sample.altitude_m,sample.airspeed_ms,sample.battery_pct]);if(sample.airspeed_ms<0||sample.battery_pct<0||sample.battery_pct>100)throw Error('Invalid measurements.');return sample;}
function streamDecode(bytes,chunkSize=7){if(!Number.isInteger(chunkSize)||chunkSize<1||chunkSize>1024)throw Error('Invalid chunk size.');let buffer=[],rejected=0,discarded=0;const rows=[];for(let i=0;i<bytes.length;i+=chunkSize){buffer.push(...bytes.slice(i,i+chunkSize));while(buffer.length){let start=-1;for(let j=0;j<buffer.length-1;j++)if(buffer[j]===65&&buffer[j+1]===84){start=j;break;}if(start<0){const keep=buffer.at(-1)===65?1:0;discarded+=buffer.length-keep;buffer=keep?[65]:[];break;}discarded+=start;buffer.splice(0,start);if(buffer.length<4)break;if(buffer[2]!==26||buffer[3]!==0){rejected++;discarded++;buffer.shift();continue;}if(buffer.length<32)break;try{rows.push(decode(Uint8Array.from(buffer.slice(0,32))));buffer.splice(0,32);}catch{rejected++;discarded++;buffer.shift();}}}return {rows,summary:{decoded:rows.length,rejected,discarded_bytes:discarded,pending_bytes:buffer.length}};}
function parseTLE(text){const lines=text.trim().split(/\r?\n/).map(l=>l.trim()).filter(Boolean);if(lines.length!==3||!lines[1].startsWith('1 ')||!lines[2].startsWith('2 '))throw Error('Provide name and two TLE lines.');for(const l of lines.slice(1)){if(l.length!==69||!/^\d$/.test(l[68]))throw Error('TLE must contain 69 characters per line.');const checksum=[...l.slice(0,68)].reduce((s,c)=>s+(/\d/.test(c)?Number(c):c==='-'?1:0),0)%10;if(checksum!==Number(l[68]))throw Error('TLE checksum mismatch.');}if(lines[1].slice(2,7)!==lines[2].slice(2,7))throw Error('Satellite identifiers do not match.');return lines;}
return {telemetry,flightDemo,pid,rocket,wing,naca4,crc16,encode,decode,streamDecode,parseTLE};
});
