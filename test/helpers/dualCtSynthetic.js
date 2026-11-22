'use strict';
// Generated wire data only. No customer frames, serial numbers or screenshots.
const profile = require('../../settings/dual-ct-contract');
function varint(n) { const bytes=[]; do {bytes.push((n&127)|(n>127?128:0));n=Math.floor(n/128);}while(n);return Buffer.from(bytes); }
function scalar(field,value) { const bytes=Buffer.alloc(4);bytes.writeFloatLE(value);return Buffer.concat([varint(field*8+5),bytes]); }
function nested(field,rows) { const bytes=Buffer.concat(rows.map(([n,v])=>scalar(n,v)));return Buffer.concat([varint(field*8+2),varint(bytes.length),bytes]); }
function bankRows(seed=1) {
  return profile.banks.flatMap((bank,index)=>{
    const phases=[seed+index*10,seed+index*10+1,-seed];
    return [[bank.total,phases.reduce((sum,n)=>sum+n,0)],...bank.power.map((field,i)=>[field,phases[i]]),
      ...bank.voltage.map(field=>[field,230]),...bank.current.map(field=>[field,0.5])];
  });
}
function packet(seed=1,counter=null) {
  const bytes=bankRows(seed).map(([field,value])=>scalar(field,value));
  if(counter)bytes.push(nested(773,counter));
  return Buffer.concat(bytes);
}
const context=(at,receivedAt=at,extra={})=>({productType:421,cmdFunc:254,cmdId:21,source:'app_mqtt',
  encoding:'plain',encodingBasis:'omitted_zero_candidate',now:at,receivedAt,...extra});
module.exports={varint,scalar,nested,bankRows,packet,context};
