const test=require('node:test'),assert=require('node:assert/strict');
const M=require('./models.js'),reference=require('./reference-fixtures.json'),satellite=require('./vendor/satellite.min.js');
function compare(actual,expected,tolerance=1e-6){for(const [key,value] of Object.entries(expected)){if(!(key in actual))continue;if(typeof value==='number')assert.ok(Math.abs(actual[key]-value)<tolerance,`${key}: ${actual[key]} vs ${value}`);else assert.equal(actual[key],value);}}
test('telemetry summary agrees with Python',()=>compare(M.telemetry(M.flightDemo()).summary,reference.telemetry));
test('nonuniform gradient and validation',()=>{const result=M.telemetry([{time_s:0,altitude_m:0,airspeed_ms:2,battery_pct:100},{time_s:2,altitude_m:6,airspeed_ms:2,battery_pct:90},{time_s:5,altitude_m:15,airspeed_ms:2,battery_pct:80}]);assert.ok(result.rows.every(r=>Math.abs(r.vertical_speed_ms-3)<1e-10));assert.throws(()=>M.telemetry([{time_s:0},{time_s:0}]));});
test('PID metrics agree with Python',()=>compare(M.pid().summary,reference.pid));
test('rocket metrics agree with RK4 Python model',()=>compare(M.rocket().summary,reference.rocket,0.001));
test('no rocket lift-off with zero thrust',()=>assert.equal(M.rocket({thrust_n:0}).summary.apogee_m,0));
test('wing performance agrees with Python',()=>compare(M.wing().summary,reference.wing));
test('NACA geometry agrees with Python',()=>{const actual=M.naca4();for(const side of ['upper','lower'])actual[side].forEach((point,i)=>point.forEach((v,j)=>assert.ok(Math.abs(v-reference.naca[side][i][j])<1e-12)));});
test('CRC reference vector',()=>assert.equal(M.crc16(new TextEncoder().encode('123456789')),0x29b1));
test('wire encoding matches Python and handles corruption',()=>{const packet=M.encode();assert.equal(Buffer.from(packet).toString('hex'),reference.packet);assert.equal(M.decode(packet).sequence,42);packet[18]^=1;assert.throws(()=>M.decode(packet),/CRC/);});
test('stream fragmentation and recovery',()=>{const packet=M.encode(),bad=Uint8Array.from(packet);bad[18]^=1;for(let size=1;size<=32;size++){const result=M.streamDecode(Uint8Array.from([...bad,...packet]),size);assert.equal(result.rows.length,1);assert.equal(result.summary.rejected,1);}});
test('SGP4 coordinates agree with Skyfield at example epoch',()=>{const lines=['1 25544U 98067A   24001.50000000  .00016717  00000+0  30134-3 0  9997','2 25544  51.6416  20.0000 0005000  40.0000  80.0000 15.50000000430002'];const rec=satellite.twoline2satrec(...lines),date=new Date(reference.orbit.epoch),state=satellite.propagate(rec,date),geo=satellite.eciToGeodetic(state.position,satellite.gstime(date));assert.ok(Math.abs(geo.height-reference.orbit.point.altitude_km)<.01);assert.ok(Math.abs(geo.latitude*180/Math.PI-reference.orbit.point.lat)<.001);assert.ok(Math.abs(geo.longitude*180/Math.PI-reference.orbit.point.lon)<.01);});
test('TLE checksums rejected',()=>assert.throws(()=>M.parseTLE('ISS\n1 bad\n2 bad')));
