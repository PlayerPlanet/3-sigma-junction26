(()=>{var Nu=[4,3,2],ha=.1,da=[.15,.7,.15],en=20,fa=.001,Hn=["any","no_touch","parallel","border","center_clear","clustered"],ns=Hn.length,yt=36,yl=12,Lu=yt+yl,xl=i=>(i=Math.min(Math.max(i,1e-15),1-1e-15),-(i*Math.log(i)+(1-i)*Math.log1p(-i))),nr=i=>i<yt?1:2;var ua=null;function is(){if(ua)return ua;let i=Nu.map(m=>{let p=[];for(let y of[1,0])for(let w=0;w<6;w++)for(let M=0;M<6;M++){let b=[],E=!0;for(let x=0;x<m;x++){let T=y?w:w+x,N=y?M+x:M;(T>=6||N>=6)&&(E=!1),b.push([T,N])}E&&p.push({horiz:y,cells:b})}return p}),e=(m,p)=>{let y=0n,w=p?[-1,0,1]:[0];for(let[M,b]of m)for(let E of w)for(let x of w){let T=M+E,N=b+x;T>=0&&T<6&&N>=0&&N<6&&(y|=1n<<BigInt(T*6+N))}return y},t=new Set([14,15,20,21]),n=i.map(m=>m.map(p=>({m:e(p.cells,!1),d:e(p.cells,!0),h:p.horiz,edge:p.cells.some(([y,w])=>y===0||y===5||w===0||w===5),cen:p.cells.some(([y,w])=>t.has(y*6+w)),idx:p.cells.map(([y,w])=>y*6+w)}))),s=[],r=Hn.map(()=>[]);for(let m=0;m<n[0].length;m++)for(let p=0;p<n[1].length;p++){let y=n[0][m],w=n[1][p];if(!(y.m&w.m))for(let M=0;M<n[2].length;M++){let b=n[2][M];if(y.m&b.m||w.m&b.m)continue;let E=(y.d&w.m)!==0n,x=(y.d&b.m)!==0n,T=(w.d&b.m)!==0n;s.push([m,p,M]),r[0].push(1),r[1].push(E||x||T?0:1),r[2].push(y.h===w.h&&w.h===b.h?1:0),r[3].push(y.edge&&w.edge&&b.edge?1:0),r[4].push(y.cen||w.cen||b.cen?0:1),r[5].push((E||x)&&(E||T)&&(x||T)?1:0)}}let a=s.length,o=new Uint8Array(a*yt),l=new Uint8Array(yl*a);for(let m=0;m<a;m++){let[p,y,w]=s[m];for(let M of[...n[0][p].idx,...n[1][y].idx,...n[2][w].idx])o[m*yt+M]=1,l[Math.floor(M/6)*a+m]++,l[(6+M%6)*a+m]++}let c=r.map(m=>Uint8Array.from(m)),u=c.map(m=>m.reduce((p,y)=>p+y,0)),h=new Float64Array(a);for(let m=0;m<ns;m++){let p=1/(ns*u[m]),y=c[m];for(let w=0;w<a;w++)y[w]&&(h[w]+=p)}let d=new Float64Array(yt);for(let m=0;m<a;m++){let p=h[m],y=m*yt;for(let w=0;w<yt;w++)o[y+w]&&(d[w]+=p)}let f=0;for(let m=0;m<yt;m++)f+=xl(d[m]);let g=[],_=[];for(let m=0;m<=6;m++){let p=new Float64Array(7);[-1,0,1].forEach((y,w)=>{p[Math.min(Math.max(m+y,0),6)]+=da[w]}),g.push(p),_.push(-p.reduce((y,w)=>y+(w>0?w*Math.log(w):0),0))}return ua={placements:i,P:n,ships:s,L:a,occ:o,lines:l,member:c,nRule:u,w0:h,p0:d,cellNorm:f,scanT:g,scanH:_},ua}function vl(i){let e=is();return e.ships[i].map((t,n)=>({length:Nu[n],horiz:!!e.P[n][t].h,cells:e.placements[n][t].cells}))}function Uu(i,e,t,n){let s=is();if(e<yt)return s.occ[i*yt+e]^(n[t]<ha?1:0);let r=s.lines[(e-yt)*s.L+i],a=n[t]<da[0]?-1:n[t]<da[0]+da[1]?0:1;return Math.min(Math.max(r+a,0),6)}var pa=class{constructor(){this.g=is(),this.ll=new Float64Array(this.g.L),this.obs=[],this._w=null}update(e,t){let n=this.g,s=this.ll,r=n.L;if(e<yt){let a=Math.log1p(-ha),o=Math.log(ha);for(let l=0;l<r;l++)s[l]+=n.occ[l*yt+e]===t?a:o}else{let a=(e-yt)*r,o=n.scanT.map(l=>l[t]>0?Math.log(l[t]):-1/0);for(let l=0;l<r;l++)s[l]+=o[n.lines[a+l]]}this.obs.push([e,t]),this._w=null}_A(){let e=this.ll,t=this.g.L,n=-1/0;for(let r=0;r<t;r++)e[r]>n&&(n=e[r]);let s=new Float64Array(t);for(let r=0;r<t;r++)s[r]=Math.exp(e[r]-n);return s}layoutWeights(){if(this._w)return this._w;let e=this._A(),t=this.g.w0,n=this.g.L,s=0;for(let r=0;r<n;r++)e[r]*=t[r],s+=e[r];for(let r=0;r<n;r++)e[r]/=s;return this._w=e,e}rules(){let e=this._A(),t=this.g,n=t.member.map((r,a)=>{let o=0;for(let l=0;l<t.L;l++)r[l]&&(o+=e[l]);return o/t.nRule[a]}),s=n.reduce((r,a)=>r+a,0);return n.map(r=>r/s)}occupancy(){let e=this.layoutWeights(),t=this.g,n=new Float64Array(yt);for(let s=0;s<t.L;s++){let r=e[s];if(r===0)continue;let a=s*yt;for(let o=0;o<yt;o++)t.occ[a+o]&&(n[o]+=r)}return Array.from(n,s=>Math.min(Math.max(s,0),1))}eig(){let e=this.g,t=this.layoutWeights(),n=this.occupancy(),s=ha,r=new Float64Array(Lu);for(let a=0;a<yt;a++)r[a]=xl((1-s)*n[a]+s*(1-n[a]))-xl(s);for(let a=0;a<yl;a++){let o=new Float64Array(7),l=a*e.L;for(let h=0;h<e.L;h++)o[e.lines[l+h]]+=t[h];let c=0,u=0;for(let h=0;h<=6;h++){let d=0;for(let f=0;f<=6;f++)d+=o[f]*e.scanT[f][h];d>0&&(c-=d*Math.log(d))}for(let h=0;h<=6;h++)u+=o[h]*e.scanH[h];r[yt+a]=c-u}return r}};function Du(i,e){let t=i.eig(),n=-1,s=-1/0;for(let r=0;r<Lu;r++){let a=nr(r);if(a>e)continue;let o=t[r]/a;o>s&&(s=o,n=r)}return n}function cf(i,e){let t=(1-fa)*i[e]+fa/ns;return(Math.log(t)-Math.log(1/ns))/Math.log(ns)}function uf(i,e){let t=is(),n=0;for(let s=0;s<yt;s++){let r=(1-fa)*i[s]+fa*t.p0[s];n+=t.occ[e*yt+s]?Math.log(r)-Math.log(t.p0[s]):Math.log1p(-r)-Math.log1p(-t.p0[s])}return n/t.cellNorm}function _l(i,e,t,n){let s=cf(i,t),r=uf(e,n);return{rule_part:s,cell_part:r,score_raw:.5*(s+r)}}function Ou(i,e){return Hn.map((t,n)=>n===i?e:(1-e)/(ns-1))}var wh=0,sc=1,Eh=2;var Wi=1,Ah=2,Bs=3,Mn=0,Rt=1,Xt=2,oi=0,Vs=1,qi=2,rc=3,ac=4,uo=5;var Xi=100,Rh=101,Ch=102,Ih=103,Ph=104,Nh=200,ho=201,Lh=202,Uh=203,oc=204,Vr=205,Dh=206,Oh=207,Fh=208,Bh=209,Vh=210,kh=211,zh=212,Gh=213,Hh=214,Ga=0,Ha=1,Wa=2,vs=3,qa=4,Xa=5,Ka=6,ja=7,lc=0,Wh=1,qh=2,Fn=0,kr=1,zr=2,Gr=3,Ki=4,Hr=5,Wr=6,qr=7,ql="attached",Xh="detached",cc=300,ji=301,ks=302,fo=303,po=304,Rn=1e3,_n=1001,_s=1002,vt=1003,mo=1004;var Zi=1005;var ut=1006,zs=1007;var an=1008;var on=1009,uc=1010,hc=1011,Gs=1012,go=1013,Cn=1014,fn=1015,_t=1016,xo=1017,yo=1018,Yi=1020,dc=35902,fc=35899,pc=1021,mc=1022,ln=1023,Jn=1026,li=1027,Hs=1028,vo=1029,wi=1030,_o=1031;var So=1033,Xr=33776,Kr=33777,jr=33778,Zr=33779,Mo=35840,bo=35841,To=35842,wo=35843,Eo=36196,Ao=37492,Ro=37496,Co=37488,Io=37489,Yr=37490,Po=37491,No=37808,Lo=37809,Uo=37810,Do=37811,Oo=37812,Fo=37813,Bo=37814,Vo=37815,ko=37816,zo=37817,Go=37818,Ho=37819,Wo=37820,qo=37821,Xo=36492,Ko=36494,jo=36495,Zo=36283,Yo=36284,Jr=36285,Jo=36286;var Oi=2300,Fi=2301,ka=2302,Xl=2303,Kl=2400,jl=2401,Zl=2402,Kh=2500;var gc=0,Qr=1,Ws=2,jh=3200;var Qo=0,Zh=1,ci="",At="srgb",Yt="srgb-linear",pr="linear",Je="srgb";var za=7680;var Yh=519,Jh=512,Qh=513,$h=514,xc=515,ed=516,td=517,yc=518,vc=519,_c=35044;var Sc="300 es",Sn=2e3,Ss=2001;function df(i){for(let e=i.length-1;e>=0;--e)if(i[e]>=65535)return!0;return!1}function ff(i){return ArrayBuffer.isView(i)&&!(i instanceof DataView)}function Ms(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function nd(){let i=Ms("canvas");return i.style.display="block",i}var Fu={},bs=null;function mr(...i){let e="THREE."+i.shift();bs?bs("log",e,...i):console.log(e,...i)}function id(i){let e=i[0];if(typeof e=="string"&&e.startsWith("TSL:")){let t=i[1];t&&t.isStackTrace?i[0]+=" "+t.getLocation():i[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return i}function be(...i){i=id(i);let e="THREE."+i.shift();if(bs)bs("warn",e,...i);else{let t=i[0];t&&t.isStackTrace?console.warn(t.getError(e)):console.warn(e,...i)}}function Ne(...i){i=id(i);let e="THREE."+i.shift();if(bs)bs("error",e,...i);else{let t=i[0];t&&t.isStackTrace?console.error(t.getError(e)):console.error(e,...i)}}function Di(...i){let e=i.join(" ");e in Fu||(Fu[e]=!0,be(...i))}function sd(i,e,t){return new Promise(function(n,s){function r(){switch(i.clientWaitSync(e,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:s();break;case i.TIMEOUT_EXPIRED:setTimeout(r,t);break;default:n()}}setTimeout(r,t)})}var rd={[Ga]:Ga,[Wa]:Ka,[qa]:qa,[vs]:Xa,[Ha]:Ha,[Ka]:Wa,[ja]:ja,[Xa]:vs},Un=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){let n=this._listeners;return n===void 0?!1:n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){let n=this._listeners;if(n===void 0)return;let s=n[e];if(s!==void 0){let r=s.indexOf(t);r!==-1&&s.splice(r,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let n=t[e.type];if(n!==void 0){e.target=this;let s=n.slice(0);for(let r=0,a=s.length;r<a;r++)s[r].call(this,e);e.target=null}}},zt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],Bu=1234567,dr=Math.PI/180,Bi=180/Math.PI;function Bn(){let i=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(zt[i&255]+zt[i>>8&255]+zt[i>>16&255]+zt[i>>24&255]+"-"+zt[e&255]+zt[e>>8&255]+"-"+zt[e>>16&15|64]+zt[e>>24&255]+"-"+zt[t&63|128]+zt[t>>8&255]+"-"+zt[t>>16&255]+zt[t>>24&255]+zt[n&255]+zt[n>>8&255]+zt[n>>16&255]+zt[n>>24&255]).toLowerCase()}function We(i,e,t){return Math.max(e,Math.min(t,i))}function Mc(i,e){return(i%e+e)%e}function pf(i,e,t,n,s){return n+(i-e)*(s-n)/(t-e)}function mf(i,e,t){return i!==e?(t-i)/(e-i):0}function fr(i,e,t){return(1-t)*i+t*e}function gf(i,e,t,n){return fr(i,e,1-Math.exp(-t*n))}function xf(i,e=1){return e-Math.abs(Mc(i,e*2)-e)}function yf(i,e,t){return i<=e?0:i>=t?1:(i=(i-e)/(t-e),i*i*(3-2*i))}function vf(i,e,t){return i<=e?0:i>=t?1:(i=(i-e)/(t-e),i*i*i*(i*(i*6-15)+10))}function _f(i,e){return i+Math.floor(Math.random()*(e-i+1))}function Sf(i,e){return i+Math.random()*(e-i)}function Mf(i){return i*(.5-Math.random())}function bf(i){i!==void 0&&(Bu=i);let e=Bu+=1831565813;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}function Tf(i){return i*dr}function wf(i){return i*Bi}function Ef(i){return i>0&&Number.isInteger(i)&&2**Math.round(Math.log2(i))===i}function Af(i){return Math.pow(2,Math.ceil(Math.log(i)/Math.LN2))}function bc(i){return Math.pow(2,Math.floor(Math.log(i)/Math.LN2))}function Rf(i,e,t,n,s){let r=Math.cos,a=Math.sin,o=r(t/2),l=a(t/2),c=r((e+n)/2),u=a((e+n)/2),h=r((e-n)/2),d=a((e-n)/2),f=r((n-e)/2),g=a((n-e)/2);switch(s){case"XYX":i.set(o*u,l*h,l*d,o*c);break;case"YZY":i.set(l*d,o*u,l*h,o*c);break;case"ZXZ":i.set(l*h,l*d,o*u,o*c);break;case"XZX":i.set(o*u,l*g,l*f,o*c);break;case"YXY":i.set(l*f,o*u,l*g,o*c);break;case"ZYZ":i.set(l*g,l*f,o*u,o*c);break;default:be("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+s)}}function $o(i){switch(i.constructor){case Uint32Array:return 4294967295;case Uint16Array:return 65535;case Uint8Array:case Uint8ClampedArray:return 255;case Int32Array:return 2147483647;case Int16Array:return 32767;case Int8Array:return 127;default:return}}function Tc(i,e){if(e.constructor===Float32Array)return i;let t=$o(e);if(t===void 0)throw new Error("THREE.MathUtils: Invalid component type.");return Math.max(i/t,-1)}function wc(i,e){if(e.constructor===Float32Array)return i;let t=$o(e);if(t===void 0)throw new Error("THREE.MathUtils: Invalid component type.");return Math.round(i*t)}var Ji={DEG2RAD:dr,RAD2DEG:Bi,generateUUID:Bn,clamp:We,euclideanModulo:Mc,mapLinear:pf,inverseLerp:mf,lerp:fr,damp:gf,pingpong:xf,smoothstep:yf,smootherstep:vf,randInt:_f,randFloat:Sf,randFloatSpread:Mf,seededRandom:bf,degToRad:Tf,radToDeg:wf,isPowerOfTwo:Ef,ceilPowerOfTwo:Af,floorPowerOfTwo:bc,setQuaternionFromProperEuler:Rf,normalize:wc,denormalize:Tc},Ee=class{static{this.prototype.isVector2=!0}constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("THREE.Vector2: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,s=e.elements;return this.x=s[0]*t+s[3]*n+s[6],this.y=s[1]*t+s[4]*n+s[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=We(this.x,e.x,t.x),this.y=We(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=We(this.x,e,t),this.y=We(this.y,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(We(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(We(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),s=Math.sin(t),r=this.x-e.x,a=this.y-e.y;return this.x=r*n-a*s+e.x,this.y=r*s+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},hn=class{constructor(e=0,t=0,n=0,s=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=s}static slerpFlat(e,t,n,s,r,a,o){let l=n[s+0],c=n[s+1],u=n[s+2],h=n[s+3],d=r[a+0],f=r[a+1],g=r[a+2],_=r[a+3];if(h!==_||l!==d||c!==f||u!==g){let m=l*d+c*f+u*g+h*_;m<0&&(d=-d,f=-f,g=-g,_=-_,m=-m);let p=1-o;if(m<.9995){let y=Math.acos(m),w=Math.sin(y);p=Math.sin(p*y)/w,o=Math.sin(o*y)/w,l=l*p+d*o,c=c*p+f*o,u=u*p+g*o,h=h*p+_*o}else{l=l*p+d*o,c=c*p+f*o,u=u*p+g*o,h=h*p+_*o;let y=1/Math.sqrt(l*l+c*c+u*u+h*h);l*=y,c*=y,u*=y,h*=y}}e[t]=l,e[t+1]=c,e[t+2]=u,e[t+3]=h}static multiplyQuaternionsFlat(e,t,n,s,r,a){let o=n[s],l=n[s+1],c=n[s+2],u=n[s+3],h=r[a],d=r[a+1],f=r[a+2],g=r[a+3];return e[t]=o*g+u*h+l*f-c*d,e[t+1]=l*g+u*d+c*h-o*f,e[t+2]=c*g+u*f+o*d-l*h,e[t+3]=u*g-o*h-l*d-c*f,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,s){return this._x=e,this._y=t,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let n=e._x,s=e._y,r=e._z,a=e._order,o=Math.cos,l=Math.sin,c=o(n/2),u=o(s/2),h=o(r/2),d=l(n/2),f=l(s/2),g=l(r/2);switch(a){case"XYZ":this._x=d*u*h+c*f*g,this._y=c*f*h-d*u*g,this._z=c*u*g+d*f*h,this._w=c*u*h-d*f*g;break;case"YXZ":this._x=d*u*h+c*f*g,this._y=c*f*h-d*u*g,this._z=c*u*g-d*f*h,this._w=c*u*h+d*f*g;break;case"ZXY":this._x=d*u*h-c*f*g,this._y=c*f*h+d*u*g,this._z=c*u*g+d*f*h,this._w=c*u*h-d*f*g;break;case"ZYX":this._x=d*u*h-c*f*g,this._y=c*f*h+d*u*g,this._z=c*u*g-d*f*h,this._w=c*u*h+d*f*g;break;case"YZX":this._x=d*u*h+c*f*g,this._y=c*f*h+d*u*g,this._z=c*u*g-d*f*h,this._w=c*u*h-d*f*g;break;case"XZY":this._x=d*u*h-c*f*g,this._y=c*f*h-d*u*g,this._z=c*u*g+d*f*h,this._w=c*u*h+d*f*g;break;default:be("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let n=t/2,s=Math.sin(n);return this._x=e.x*s,this._y=e.y*s,this._z=e.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],s=t[4],r=t[8],a=t[1],o=t[5],l=t[9],c=t[2],u=t[6],h=t[10],d=n+o+h;if(d>0){let f=.5/Math.sqrt(d+1);this._w=.25/f,this._x=(u-l)*f,this._y=(r-c)*f,this._z=(a-s)*f}else if(n>o&&n>h){let f=2*Math.sqrt(1+n-o-h);this._w=(u-l)/f,this._x=.25*f,this._y=(s+a)/f,this._z=(r+c)/f}else if(o>h){let f=2*Math.sqrt(1+o-n-h);this._w=(r-c)/f,this._x=(s+a)/f,this._y=.25*f,this._z=(l+u)/f}else{let f=2*Math.sqrt(1+h-n-o);this._w=(a-s)/f,this._x=(r+c)/f,this._y=(l+u)/f,this._z=.25*f}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<1e-8?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(We(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let s=Math.min(1,t/n);return this.slerp(e,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let n=e._x,s=e._y,r=e._z,a=e._w,o=t._x,l=t._y,c=t._z,u=t._w;return this._x=n*u+a*o+s*c-r*l,this._y=s*u+a*l+r*o-n*c,this._z=r*u+a*c+n*l-s*o,this._w=a*u-n*o-s*l-r*c,this._onChangeCallback(),this}slerp(e,t){let n=e._x,s=e._y,r=e._z,a=e._w,o=this.dot(e);o<0&&(n=-n,s=-s,r=-r,a=-a,o=-o);let l=1-t;if(o<.9995){let c=Math.acos(o),u=Math.sin(c);l=Math.sin(l*c)/u,t=Math.sin(t*c)/u,this._x=this._x*l+n*t,this._y=this._y*l+s*t,this._z=this._z*l+r*t,this._w=this._w*l+a*t,this._onChangeCallback()}else this._x=this._x*l+n*t,this._y=this._y*l+s*t,this._z=this._z*l+r*t,this._w=this._w*l+a*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),s=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(s*Math.sin(e),s*Math.cos(e),r*Math.sin(t),r*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},D=class{static{this.prototype.isVector3=!0}constructor(e=0,t=0,n=0){this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("THREE.Vector3: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(Vu.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(Vu.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6]*s,this.y=r[1]*t+r[4]*n+r[7]*s,this.z=r[2]*t+r[5]*n+r[8]*s,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,s=this.z,r=e.elements,a=1/(r[3]*t+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*t+r[4]*n+r[8]*s+r[12])*a,this.y=(r[1]*t+r[5]*n+r[9]*s+r[13])*a,this.z=(r[2]*t+r[6]*n+r[10]*s+r[14])*a,this}applyQuaternion(e){let t=this.x,n=this.y,s=this.z,r=e.x,a=e.y,o=e.z,l=e.w,c=2*(a*s-o*n),u=2*(o*t-r*s),h=2*(r*n-a*t);return this.x=t+l*c+a*h-o*u,this.y=n+l*u+o*c-r*h,this.z=s+l*h+r*u-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[4]*n+r[8]*s,this.y=r[1]*t+r[5]*n+r[9]*s,this.z=r[2]*t+r[6]*n+r[10]*s,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=We(this.x,e.x,t.x),this.y=We(this.y,e.y,t.y),this.z=We(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=We(this.x,e,t),this.y=We(this.y,e,t),this.z=We(this.z,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(We(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let n=e.x,s=e.y,r=e.z,a=t.x,o=t.y,l=t.z;return this.x=s*l-r*o,this.y=r*a-n*l,this.z=n*o-s*a,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return Sl.copy(this).projectOnVector(e),this.sub(Sl)}reflect(e){return this.sub(Sl.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(We(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,s=this.z-e.z;return t*t+n*n+s*s}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let s=Math.sin(t)*e;return this.x=s*Math.sin(n),this.y=Math.cos(t)*e,this.z=s*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),s=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=s,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},Sl=new D,Vu=new hn,Ue=class{static{this.prototype.isMatrix3=!0}constructor(e,t,n,s,r,a,o,l,c){this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,s,r,a,o,l,c)}set(e,t,n,s,r,a,o,l,c){let u=this.elements;return u[0]=e,u[1]=s,u[2]=o,u[3]=t,u[4]=r,u[5]=l,u[6]=n,u[7]=a,u[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,s=t.elements,r=this.elements,a=n[0],o=n[3],l=n[6],c=n[1],u=n[4],h=n[7],d=n[2],f=n[5],g=n[8],_=s[0],m=s[3],p=s[6],y=s[1],w=s[4],M=s[7],b=s[2],E=s[5],x=s[8];return r[0]=a*_+o*y+l*b,r[3]=a*m+o*w+l*E,r[6]=a*p+o*M+l*x,r[1]=c*_+u*y+h*b,r[4]=c*m+u*w+h*E,r[7]=c*p+u*M+h*x,r[2]=d*_+f*y+g*b,r[5]=d*m+f*w+g*E,r[8]=d*p+f*M+g*x,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],u=e[8];return t*a*u-t*o*c-n*r*u+n*o*l+s*r*c-s*a*l}invert(){let e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],u=e[8],h=u*a-o*c,d=o*l-u*r,f=c*r-a*l,g=t*h+n*d+s*f;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);let _=1/g;return e[0]=h*_,e[1]=(s*c-u*n)*_,e[2]=(o*n-s*a)*_,e[3]=d*_,e[4]=(u*t-s*l)*_,e[5]=(s*r-o*t)*_,e[6]=f*_,e[7]=(n*l-c*t)*_,e[8]=(a*t-n*r)*_,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,s,r,a,o){let l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*a+c*o)+a+e,-s*c,s*l,-s*(-c*a+l*o)+o+t,0,0,1),this}scale(e,t){return Di("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(Ml.makeScale(e,t)),this}rotate(e){return Di("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(Ml.makeRotation(-e)),this}translate(e,t){return Di("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(Ml.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let s=0;s<9;s++)if(t[s]!==n[s])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}},Ml=new Ue,ku=new Ue().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),zu=new Ue().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Cf(){let i={enabled:!0,workingColorSpace:Yt,spaces:{},convert:function(s,r,a){return this.enabled===!1||r===a||!r||!a||(this.spaces[r].transfer===Je&&(s.r=Yn(s.r),s.g=Yn(s.g),s.b=Yn(s.b)),this.spaces[r].primaries!==this.spaces[a].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===Je&&(s.r=ys(s.r),s.g=ys(s.g),s.b=ys(s.b))),s},workingToColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},colorSpaceToWorking:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===ci?pr:this.spaces[s].transfer},getToneMappingMode:function(s){return this.spaces[s].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,a){return s.copy(this.spaces[a].fromXYZ).multiply(this.spaces[r].toXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[Yt]:{primaries:e,whitePoint:n,transfer:pr,toXYZ:ku,fromXYZ:zu,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:At},outputColorSpaceConfig:{drawingBufferColorSpace:At}},[At]:{primaries:e,whitePoint:n,transfer:Je,toXYZ:ku,fromXYZ:zu,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:At}}}),i}var Ve=Cf();function Yn(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function ys(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}var ss,Za=class{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{ss===void 0&&(ss=Ms("canvas")),ss.width=e.width,ss.height=e.height;let s=ss.getContext("2d");e instanceof ImageData?s.putImageData(e,0,0):s.drawImage(e,0,0,e.width,e.height),n=ss}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){let t=Ms("canvas");t.width=e.width,t.height=e.height;let n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);let s=n.getImageData(0,0,e.width,e.height),r=s.data;for(let a=0;a<r.length;a++)r[a]=Yn(r[a]/255)*255;return n.putImageData(s,0,0),t}else if(e.data){let t=e.data.slice(0);for(let n=0;n<t.length;n++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[n]=Math.floor(Yn(t[n]/255)*255):t[n]=Yn(t[n]);return{data:t,width:e.width,height:e.height}}else return be("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}},If=0,Ts=class{constructor(e=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:If++}),this.uuid=Bn(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){let t=this.data;return typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<"u"&&t instanceof VideoFrame?e.set(t.displayWidth,t.displayHeight,0):t!==null?e.set(t.width||0,t.height||0,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let a=0,o=s.length;a<o;a++)s[a].isDataTexture?r.push(bl(s[a].image)):r.push(bl(s[a]))}else r=bl(s);n.url=r}return t||(e.images[this.uuid]=n),n}};function bl(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?Za.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(be("Texture: Unable to serialize Texture."),{})}var Pf=0,Tl=new D,Dt=class i extends Un{constructor(e=i.DEFAULT_IMAGE,t=i.DEFAULT_MAPPING,n=_n,s=_n,r=ut,a=an,o=ln,l=on,c=i.DEFAULT_ANISOTROPY,u=ci){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Pf++}),this.uuid=Bn(),this.name="",this.source=new Ts(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=a,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new Ee(0,0),this.repeat=new Ee(1,1),this.center=new Ee(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Ue,this.generateMipmaps=!0,this.mipmapsAutoUpdate=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0,this.isPMREMTexture=!1,this.normalized=!1}get width(){return this.source.getSize(Tl).x}get height(){return this.source.getSize(Tl).y}get depth(){return this.source.getSize(Tl).z}get image(){return this.source.data}set image(e){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.normalized=e.normalized,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.mipmapsAutoUpdate=e.mipmapsAutoUpdate,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isPMREMTexture=e.isPMREMTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(let t in e){let n=e[t];if(n===void 0){be(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}let s=this[t];if(s===void 0){be(`Texture.setValues(): property '${t}' does not exist.`);continue}s&&n&&s.isVector2&&n.isVector2||s&&n&&s.isVector3&&n.isVector3||s&&n&&s.isMatrix3&&n.isMatrix3?s.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,mipmapsAutoUpdate:this.mipmapsAutoUpdate,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==cc)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case Rn:e.x=e.x-Math.floor(e.x);break;case _n:e.x=e.x<0?0:1;break;case _s:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case Rn:e.y=e.y-Math.floor(e.y);break;case _n:e.y=e.y<0?0:1;break;case _s:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}};Dt.DEFAULT_IMAGE=null;Dt.DEFAULT_MAPPING=cc;Dt.DEFAULT_ANISOTROPY=1;var Ye=class{static{this.prototype.isVector4=!0}constructor(e=0,t=0,n=0,s=1){this.x=e,this.y=t,this.z=n,this.w=s}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,s){return this.x=e,this.y=t,this.z=n,this.w=s,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("THREE.Vector4: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,s=this.z,r=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*s+a[12]*r,this.y=a[1]*t+a[5]*n+a[9]*s+a[13]*r,this.z=a[2]*t+a[6]*n+a[10]*s+a[14]*r,this.w=a[3]*t+a[7]*n+a[11]*s+a[15]*r,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,s,r,l=e.elements,c=l[0],u=l[4],h=l[8],d=l[1],f=l[5],g=l[9],_=l[2],m=l[6],p=l[10];if(Math.abs(u-d)<.01&&Math.abs(h-_)<.01&&Math.abs(g-m)<.01){if(Math.abs(u+d)<.1&&Math.abs(h+_)<.1&&Math.abs(g+m)<.1&&Math.abs(c+f+p-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;let w=(c+1)/2,M=(f+1)/2,b=(p+1)/2,E=(u+d)/4,x=(h+_)/4,T=(g+m)/4;return w>M&&w>b?w<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(w),s=E/n,r=x/n):M>b?M<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(M),n=E/s,r=T/s):b<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(b),n=x/r,s=T/r),this.set(n,s,r,t),this}let y=Math.sqrt((m-g)*(m-g)+(h-_)*(h-_)+(d-u)*(d-u));return Math.abs(y)<.001&&(y=1),this.x=(m-g)/y,this.y=(h-_)/y,this.z=(d-u)/y,this.w=Math.acos((c+f+p-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=We(this.x,e.x,t.x),this.y=We(this.y,e.y,t.y),this.z=We(this.z,e.z,t.z),this.w=We(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=We(this.x,e,t),this.y=We(this.y,e,t),this.z=We(this.z,e,t),this.w=We(this.w,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(We(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},Ya=class extends Un{constructor(e=1,t=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:ut,depthBuffer:!0,stencilBuffer:!1,resolveColorBuffer:!0,resolveDepthBuffer:!0,resolveStencilBuffer:!0,storeMultisampledColorBuffer:!0,storeMultisampledDepthBuffer:!0,storeMultisampledStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new Ye(0,0,e,t),this.scissorTest=!1,this.viewport=new Ye(0,0,e,t),this.textures=[];let s=n.count;for(let r=0;r<s;r++)this.textures[r]=new Dt({width:e,height:t,depth:n.depth}),this.textures[r].isRenderTargetTexture=!0,this.textures[r].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveColorBuffer=n.resolveColorBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this.storeMultisampledColorBuffer=n.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=n.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=n.storeMultisampledStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(e={}){let t={minFilter:ut,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.mipmapsAutoUpdate!==void 0&&(t.mipmapsAutoUpdate=e.mipmapsAutoUpdate),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&this._depthTexture.renderTarget===this&&(this._depthTexture.renderTarget=null),e!==null&&e.renderTarget===null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=e,this.textures[s].image.height=t,this.textures[s].image.depth=n,this.textures[s].isData3DTexture!==!0&&(this.textures[s].isArrayTexture=this.textures[s].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let s=Object.assign({},e.textures[t].image);this.textures[t].source=new Ts(s)}if(this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveColorBuffer=e.resolveColorBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,this.storeMultisampledColorBuffer=e.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=e.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=e.storeMultisampledStencilBuffer,e.depthTexture!==null)if(e.depthTexture.renderTarget===e){let t=e.depthTexture.clone();t.renderTarget=null,this.depthTexture=t}else this.depthTexture=e.depthTexture;else this.depthTexture=null;return this.samples=e.samples,this.multiview=e.multiview,this.useArrayDepthTexture=e.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}},mt=class extends Ya{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}},gr=class extends Dt{constructor(e=null,t=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:s},this.magFilter=vt,this.minFilter=vt,this.wrapR=_n,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}};var ws=class extends Dt{constructor(e=null,t=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:s},this.magFilter=vt,this.minFilter=vt,this.wrapR=_n,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}};var Le=class i{static{this.prototype.isMatrix4=!0}constructor(e,t,n,s,r,a,o,l,c,u,h,d,f,g,_,m){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,s,r,a,o,l,c,u,h,d,f,g,_,m)}set(e,t,n,s,r,a,o,l,c,u,h,d,f,g,_,m){let p=this.elements;return p[0]=e,p[4]=t,p[8]=n,p[12]=s,p[1]=r,p[5]=a,p[9]=o,p[13]=l,p[2]=c,p[6]=u,p[10]=h,p[14]=d,p[3]=f,p[7]=g,p[11]=_,p[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new i().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return this.determinantAffine()===0?(e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinantAffine()===0)return this.identity();let t=this.elements,n=e.elements,s=1/rs.setFromMatrixColumn(e,0).length(),r=1/rs.setFromMatrixColumn(e,1).length(),a=1/rs.setFromMatrixColumn(e,2).length();return t[0]=n[0]*s,t[1]=n[1]*s,t[2]=n[2]*s,t[3]=0,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,n=e.x,s=e.y,r=e.z,a=Math.cos(n),o=Math.sin(n),l=Math.cos(s),c=Math.sin(s),u=Math.cos(r),h=Math.sin(r);if(e.order==="XYZ"){let d=a*u,f=a*h,g=o*u,_=o*h;t[0]=l*u,t[4]=-l*h,t[8]=c,t[1]=f+g*c,t[5]=d-_*c,t[9]=-o*l,t[2]=_-d*c,t[6]=g+f*c,t[10]=a*l}else if(e.order==="YXZ"){let d=l*u,f=l*h,g=c*u,_=c*h;t[0]=d+_*o,t[4]=g*o-f,t[8]=a*c,t[1]=a*h,t[5]=a*u,t[9]=-o,t[2]=f*o-g,t[6]=_+d*o,t[10]=a*l}else if(e.order==="ZXY"){let d=l*u,f=l*h,g=c*u,_=c*h;t[0]=d-_*o,t[4]=-a*h,t[8]=g+f*o,t[1]=f+g*o,t[5]=a*u,t[9]=_-d*o,t[2]=-a*c,t[6]=o,t[10]=a*l}else if(e.order==="ZYX"){let d=a*u,f=a*h,g=o*u,_=o*h;t[0]=l*u,t[4]=g*c-f,t[8]=d*c+_,t[1]=l*h,t[5]=_*c+d,t[9]=f*c-g,t[2]=-c,t[6]=o*l,t[10]=a*l}else if(e.order==="YZX"){let d=a*l,f=a*c,g=o*l,_=o*c;t[0]=l*u,t[4]=_-d*h,t[8]=g*h+f,t[1]=h,t[5]=a*u,t[9]=-o*u,t[2]=-c*u,t[6]=f*h+g,t[10]=d-_*h}else if(e.order==="XZY"){let d=a*l,f=a*c,g=o*l,_=o*c;t[0]=l*u,t[4]=-h,t[8]=c*u,t[1]=d*h+_,t[5]=a*u,t[9]=f*h-g,t[2]=g*h-f,t[6]=o*u,t[10]=_*h+d}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(Nf,e,Lf)}lookAt(e,t,n){let s=this.elements;return cn.subVectors(e,t),cn.lengthSq()===0&&(cn.z=1),cn.normalize(),fi.crossVectors(n,cn),fi.lengthSq()===0&&(Math.abs(n.z)===1?cn.x+=1e-4:cn.z+=1e-4,cn.normalize(),fi.crossVectors(n,cn)),fi.normalize(),ma.crossVectors(cn,fi),s[0]=fi.x,s[4]=ma.x,s[8]=cn.x,s[1]=fi.y,s[5]=ma.y,s[9]=cn.y,s[2]=fi.z,s[6]=ma.z,s[10]=cn.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,s=t.elements,r=this.elements,a=n[0],o=n[4],l=n[8],c=n[12],u=n[1],h=n[5],d=n[9],f=n[13],g=n[2],_=n[6],m=n[10],p=n[14],y=n[3],w=n[7],M=n[11],b=n[15],E=s[0],x=s[4],T=s[8],N=s[12],C=s[1],P=s[5],F=s[9],G=s[13],A=s[2],U=s[6],B=s[10],V=s[14],$=s[3],q=s[7],Q=s[11],ee=s[15];return r[0]=a*E+o*C+l*A+c*$,r[4]=a*x+o*P+l*U+c*q,r[8]=a*T+o*F+l*B+c*Q,r[12]=a*N+o*G+l*V+c*ee,r[1]=u*E+h*C+d*A+f*$,r[5]=u*x+h*P+d*U+f*q,r[9]=u*T+h*F+d*B+f*Q,r[13]=u*N+h*G+d*V+f*ee,r[2]=g*E+_*C+m*A+p*$,r[6]=g*x+_*P+m*U+p*q,r[10]=g*T+_*F+m*B+p*Q,r[14]=g*N+_*G+m*V+p*ee,r[3]=y*E+w*C+M*A+b*$,r[7]=y*x+w*P+M*U+b*q,r[11]=y*T+w*F+M*B+b*Q,r[15]=y*N+w*G+M*V+b*ee,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],s=e[8],r=e[12],a=e[1],o=e[5],l=e[9],c=e[13],u=e[2],h=e[6],d=e[10],f=e[14],g=e[3],_=e[7],m=e[11],p=e[15],y=l*f-c*d,w=o*f-c*h,M=o*d-l*h,b=a*f-c*u,E=a*d-l*u,x=a*h-o*u;return t*(_*y-m*w+p*M)-n*(g*y-m*b+p*E)+s*(g*w-_*b+p*x)-r*(g*M-_*E+m*x)}determinantAffine(){let e=this.elements,t=e[0],n=e[4],s=e[8],r=e[1],a=e[5],o=e[9],l=e[2],c=e[6],u=e[10];return t*(a*u-o*c)-n*(r*u-o*l)+s*(r*c-a*l)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let s=this.elements;return e.isVector3?(s[12]=e.x,s[13]=e.y,s[14]=e.z):(s[12]=e,s[13]=t,s[14]=n),this}invert(){let e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],u=e[8],h=e[9],d=e[10],f=e[11],g=e[12],_=e[13],m=e[14],p=e[15],y=t*o-n*a,w=t*l-s*a,M=t*c-r*a,b=n*l-s*o,E=n*c-r*o,x=s*c-r*l,T=u*_-h*g,N=u*m-d*g,C=u*p-f*g,P=h*m-d*_,F=h*p-f*_,G=d*p-f*m,A=y*G-w*F+M*P+b*C-E*N+x*T;if(A===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let U=1/A;return e[0]=(o*G-l*F+c*P)*U,e[1]=(s*F-n*G-r*P)*U,e[2]=(_*x-m*E+p*b)*U,e[3]=(d*E-h*x-f*b)*U,e[4]=(l*C-a*G-c*N)*U,e[5]=(t*G-s*C+r*N)*U,e[6]=(m*M-g*x-p*w)*U,e[7]=(u*x-d*M+f*w)*U,e[8]=(a*F-o*C+c*T)*U,e[9]=(n*C-t*F-r*T)*U,e[10]=(g*E-_*M+p*y)*U,e[11]=(h*M-u*E-f*y)*U,e[12]=(o*N-a*P-l*T)*U,e[13]=(t*P-n*N+s*T)*U,e[14]=(_*w-g*b-m*y)*U,e[15]=(u*b-h*w+d*y)*U,this}scale(e){let t=this.elements,n=e.x,s=e.y,r=e.z;return t[0]*=n,t[4]*=s,t[8]*=r,t[1]*=n,t[5]*=s,t[9]*=r,t[2]*=n,t[6]*=s,t[10]*=r,t[3]*=n,t[7]*=s,t[11]*=r,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],s=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,s))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),s=Math.sin(t),r=1-n,a=e.x,o=e.y,l=e.z,c=r*a,u=r*o;return this.set(c*a+n,c*o-s*l,c*l+s*o,0,c*o+s*l,u*o+n,u*l-s*a,0,c*l-s*o,u*l+s*a,r*l*l+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,s,r,a){return this.set(1,n,r,0,e,1,a,0,t,s,1,0,0,0,0,1),this}compose(e,t,n){let s=this.elements,r=t._x,a=t._y,o=t._z,l=t._w,c=r+r,u=a+a,h=o+o,d=r*c,f=r*u,g=r*h,_=a*u,m=a*h,p=o*h,y=l*c,w=l*u,M=l*h,b=n.x,E=n.y,x=n.z;return s[0]=(1-(_+p))*b,s[1]=(f+M)*b,s[2]=(g-w)*b,s[3]=0,s[4]=(f-M)*E,s[5]=(1-(d+p))*E,s[6]=(m+y)*E,s[7]=0,s[8]=(g+w)*x,s[9]=(m-y)*x,s[10]=(1-(d+_))*x,s[11]=0,s[12]=e.x,s[13]=e.y,s[14]=e.z,s[15]=1,this}decompose(e,t,n){let s=this.elements;e.x=s[12],e.y=s[13],e.z=s[14];let r=this.determinantAffine();if(r===0)return n.set(1,1,1),t.identity(),this;let a=rs.set(s[0],s[1],s[2]).length(),o=rs.set(s[4],s[5],s[6]).length(),l=rs.set(s[8],s[9],s[10]).length();r<0&&(a=-a),wn.copy(this);let c=1/a,u=1/o,h=1/l;return wn.elements[0]*=c,wn.elements[1]*=c,wn.elements[2]*=c,wn.elements[4]*=u,wn.elements[5]*=u,wn.elements[6]*=u,wn.elements[8]*=h,wn.elements[9]*=h,wn.elements[10]*=h,t.setFromRotationMatrix(wn),n.x=a,n.y=o,n.z=l,this}makePerspective(e,t,n,s,r,a,o=Sn,l=!1){let c=this.elements,u=2*r/(t-e),h=2*r/(n-s),d=(t+e)/(t-e),f=(n+s)/(n-s),g,_;if(l)g=r/(a-r),_=a*r/(a-r);else if(o===Sn)g=-(a+r)/(a-r),_=-2*a*r/(a-r);else if(o===Ss)g=-a/(a-r),_=-a*r/(a-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=u,c[4]=0,c[8]=d,c[12]=0,c[1]=0,c[5]=h,c[9]=f,c[13]=0,c[2]=0,c[6]=0,c[10]=g,c[14]=_,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,s,r,a,o=Sn,l=!1){let c=this.elements,u=2/(t-e),h=2/(n-s),d=-(t+e)/(t-e),f=-(n+s)/(n-s),g,_;if(l)g=1/(a-r),_=a/(a-r);else if(o===Sn)g=-2/(a-r),_=-(a+r)/(a-r);else if(o===Ss)g=-1/(a-r),_=-r/(a-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=u,c[4]=0,c[8]=0,c[12]=d,c[1]=0,c[5]=h,c[9]=0,c[13]=f,c[2]=0,c[6]=0,c[10]=g,c[14]=_,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let s=0;s<16;s++)if(t[s]!==n[s])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}},rs=new D,wn=new Le,Nf=new D(0,0,0),Lf=new D(1,1,1),fi=new D,ma=new D,cn=new D,Gu=new Le,Hu=new hn,Qn=class i{constructor(e=0,t=0,n=0,s=i.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=s}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,s=this._order){return this._x=e,this._y=t,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let s=e.elements,r=s[0],a=s[4],o=s[8],l=s[1],c=s[5],u=s[9],h=s[2],d=s[6],f=s[10];switch(t){case"XYZ":this._y=Math.asin(We(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-u,f),this._z=Math.atan2(-a,r)):(this._x=Math.atan2(d,c),this._z=0);break;case"YXZ":this._x=Math.asin(-We(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(o,f),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-h,r),this._z=0);break;case"ZXY":this._x=Math.asin(We(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-h,f),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-We(h,-1,1)),Math.abs(h)<.9999999?(this._x=Math.atan2(d,f),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-a,c));break;case"YZX":this._z=Math.asin(We(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-u,c),this._y=Math.atan2(-h,r)):(this._x=0,this._y=Math.atan2(o,f));break;case"XZY":this._z=Math.asin(-We(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(d,c),this._y=Math.atan2(o,r)):(this._x=Math.atan2(-u,f),this._y=0);break;default:be("Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return Gu.makeRotationFromQuaternion(e),this.setFromRotationMatrix(Gu,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return Hu.setFromEuler(this),this.setFromQuaternion(Hu,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};Qn.DEFAULT_ORDER="XYZ";var Es=class{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}},Uf=0,Wu=new D,as=new hn,Wn=new Le,ga=new D,ir=new D,Df=new D,Of=new hn,qu=new D(1,0,0),Xu=new D(0,1,0),Ku=new D(0,0,1),ju={type:"added"},Ff={type:"removed"},os={type:"childadded",child:null},wl={type:"childremoved",child:null},ht=class i extends Un{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Uf++}),this.uuid=Bn(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=i.DEFAULT_UP.clone();let e=new D,t=new Qn,n=new hn,s=new D(1,1,1);function r(){n.setFromEuler(t,!1)}function a(){t.setFromQuaternion(n,void 0,!1)}t._onChange(r),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new Le},normalMatrix:{value:new Ue}}),this.matrix=new Le,this.matrixWorld=new Le,this.matrixAutoUpdate=i.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=i.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Es,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale),this.pivot!==null&&this.position.copy(this.pivot).applyMatrix4(this.matrix).sub(this.pivot)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return as.setFromAxisAngle(e,t),this.quaternion.multiply(as),this}rotateOnWorldAxis(e,t){return as.setFromAxisAngle(e,t),this.quaternion.premultiply(as),this}rotateX(e){return this.rotateOnAxis(qu,e)}rotateY(e){return this.rotateOnAxis(Xu,e)}rotateZ(e){return this.rotateOnAxis(Ku,e)}translateOnAxis(e,t){return Wu.copy(e).applyQuaternion(this.quaternion),this.position.add(Wu.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(qu,e)}translateY(e){return this.translateOnAxis(Xu,e)}translateZ(e){return this.translateOnAxis(Ku,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(Wn.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?ga.copy(e):ga.set(e,t,n);let s=this.parent;this.updateWorldMatrix(!0,!1),ir.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Wn.lookAt(ir,ga,this.up):Wn.lookAt(ga,ir,this.up),this.quaternion.setFromRotationMatrix(Wn),s&&(Wn.extractRotation(s.matrixWorld),as.setFromRotationMatrix(Wn),this.quaternion.premultiply(as.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(Ne("Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(ju),os.child=e,this.dispatchEvent(os),os.child=null):Ne("Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(Ff),wl.child=e,this.dispatchEvent(wl),wl.child=null),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),Wn.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),Wn.multiply(e.parent.matrixWorld)),e.applyMatrix4(Wn),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(ju),os.child=e,this.dispatchEvent(os),os.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,s=this.children.length;n<s;n++){let a=this.children[n].getObjectByProperty(e,t);if(a!==void 0)return a}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);let s=this.children;for(let r=0,a=s.length;r<a;r++)s[r].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ir,e,Df),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ir,Of,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}intersectsFrustum(){return!0}traverse(e){e(this);let t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let e=this.pivot;if(e!==null){let t=e.x,n=e.y,s=e.z,r=this.matrix.elements;r[12]+=t-r[0]*t-r[4]*n-r[8]*s,r[13]+=n-r[1]*t-r[5]*n-r[9]*s,r[14]+=s-r[2]*t-r[6]*n-r[10]*s}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t,n=!1){let s=this.parent;if(e===!0&&s!==null&&s.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),t===!0){let r=this.children;for(let a=0,o=r.length;a<o;a++)r[a].updateWorldMatrix(!1,!0,n)}}toJSON(e){let t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let s={};s.uuid=this.uuid,s.type=this.type,s.name=this.name,s.castShadow=this.castShadow,s.receiveShadow=this.receiveShadow,s.visible=this.visible,s.frustumCulled=this.frustumCulled,s.renderOrder=this.renderOrder,s.static=this.static,s.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.pivot!==null&&(s.pivot=this.pivot.toArray()),this.morphTargetDictionary!==void 0&&(s.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(s.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(o=>({...o})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(e),s.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function r(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(e)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(e.geometries,this.geometry);let o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){let l=o.shapes;if(Array.isArray(l))for(let c=0,u=l.length;c<u;c++){let h=l[c];r(e.shapes,h)}else r(e.shapes,l)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(e.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(r(e.materials,this.material[l]));s.material=o}else s.material=r(e.materials,this.material);if(this.children.length>0){s.children=[];for(let o=0;o<this.children.length;o++)s.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){s.animations=[];for(let o=0;o<this.animations.length;o++){let l=this.animations[o];s.animations.push(r(e.animations,l))}}if(t){let o=a(e.geometries),l=a(e.materials),c=a(e.textures),u=a(e.images),h=a(e.shapes),d=a(e.skeletons),f=a(e.animations),g=a(e.nodes);o.length>0&&(n.geometries=o),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),u.length>0&&(n.images=u),h.length>0&&(n.shapes=h),d.length>0&&(n.skeletons=d),f.length>0&&(n.animations=f),g.length>0&&(n.nodes=g)}return n.object=s,n;function a(o){let l=[];for(let c in o){let u=o[c];delete u.metadata,l.push(u)}return l}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.pivot=e.pivot!==null?e.pivot.clone():null,this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){let s=e.children[n];this.add(s.clone())}return this}dispose(){this.dispatchEvent({type:"dispose"})}};ht.DEFAULT_UP=new D(0,1,0);ht.DEFAULT_MATRIX_AUTO_UPDATE=!0;ht.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var pt=class extends ht{constructor(){super(),this.isGroup=!0,this.type="Group"}},Bf={type:"move"},As=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new pt,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new pt,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new D,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new D),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new pt,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new D,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new D,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let s=null,r=null,a=null,o=this._targetRay,l=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){a=!0;for(let _ of e.hand.values()){let m=t.getJointPose(_,n),p=this._getHandJoint(c,_);m!==null&&(p.matrix.fromArray(m.transform.matrix),p.matrix.decompose(p.position,p.quaternion,p.scale),p.matrixWorldNeedsUpdate=!0,p.jointRadius=m.radius),p.visible=m!==null}let u=c.joints["index-finger-tip"],h=c.joints["thumb-tip"],d=u.position.distanceTo(h.position),f=.02,g=.005;c.inputState.pinching&&d>f+g?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!c.inputState.pinching&&d<=f-g&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else l!==null&&e.gripSpace&&(r=t.getPose(e.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.quaternion,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:e,target:this})));o!==null&&(s=t.getPose(e.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(o.matrix.fromArray(s.transform.matrix),o.matrix.decompose(o.position,o.quaternion,o.scale),o.matrixWorldNeedsUpdate=!0,s.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(s.linearVelocity)):o.hasLinearVelocity=!1,s.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(s.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(Bf)))}return o!==null&&(o.visible=s!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let n=new pt;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}},ad={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},pi={h:0,s:0,l:0},xa={h:0,s:0,l:0};function El(i,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?i+(e-i)*6*t:t<1/2?e:t<2/3?i+(e-i)*6*(2/3-t):i}var Te=class{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let s=e;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=At){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,Ve.colorSpaceToWorking(this,t),this}setRGB(e,t,n,s=Ve.workingColorSpace){return this.r=e,this.g=t,this.b=n,Ve.colorSpaceToWorking(this,s),this}setHSL(e,t,n,s=Ve.workingColorSpace){if(e=Mc(e,1),t=We(t,0,1),n=We(n,0,1),t===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+t):n+t-n*t,a=2*n-r;this.r=El(a,r,e+1/3),this.g=El(a,r,e),this.b=El(a,r,e-1/3)}return Ve.colorSpaceToWorking(this,s),this}setStyle(e,t=At){function n(r){r!==void 0&&parseFloat(r)<1&&be("Color: Alpha component of "+e+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(e)){let r,a=s[1],o=s[2];switch(a){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,t);if(r=/^\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(100,parseFloat(r[1]))/100,Math.min(100,parseFloat(r[2]))/100,Math.min(100,parseFloat(r[3]))/100,t);break;case"hsl":case"hsla":if(r=/^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(o))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,t);break;default:be("Color: Unknown color model "+e)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(e)){let r=s[1],a=r.length;if(a===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,t);if(a===6)return this.setHex(parseInt(r,16),t);be("Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=At){let n=ad[e.toLowerCase()];return n!==void 0?this.setHex(n,t):be("Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=Yn(e.r),this.g=Yn(e.g),this.b=Yn(e.b),this}copyLinearToSRGB(e){return this.r=ys(e.r),this.g=ys(e.g),this.b=ys(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=At){return Ve.workingToColorSpace(Gt.copy(this),e),Math.round(We(Gt.r*255,0,255))*65536+Math.round(We(Gt.g*255,0,255))*256+Math.round(We(Gt.b*255,0,255))}getHexString(e=At){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=Ve.workingColorSpace){Ve.workingToColorSpace(Gt.copy(this),t);let n=Gt.r,s=Gt.g,r=Gt.b,a=Math.max(n,s,r),o=Math.min(n,s,r),l,c,u=(o+a)/2;if(o===a)l=0,c=0;else{let h=a-o;switch(c=u<=.5?h/(a+o):h/(2-a-o),a){case n:l=(s-r)/h+(s<r?6:0);break;case s:l=(r-n)/h+2;break;case r:l=(n-s)/h+4;break}l/=6}return e.h=l,e.s=c,e.l=u,e}getRGB(e,t=Ve.workingColorSpace){return Ve.workingToColorSpace(Gt.copy(this),t),e.r=Gt.r,e.g=Gt.g,e.b=Gt.b,e}getStyle(e=At){Ve.workingToColorSpace(Gt.copy(this),e);let t=Gt.r,n=Gt.g,s=Gt.b;return e!==At?`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(e,t,n){return this.getHSL(pi),this.setHSL(pi.h+e,pi.s+t,pi.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(pi),e.getHSL(xa);let n=fr(pi.h,xa.h,t),s=fr(pi.s,xa.s,t),r=fr(pi.l,xa.l,t);return this.setHSL(n,s,r),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,s=this.b,r=e.elements;return this.r=r[0]*t+r[3]*n+r[6]*s,this.g=r[1]*t+r[4]*n+r[7]*s,this.b=r[2]*t+r[5]*n+r[8]*s,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Gt=new Te;Te.NAMES=ad;var Rs=class extends ht{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Qn,this.environmentIntensity=1,this.environmentRotation=new Qn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),this.background=e.background!==null?e.background.clone():null,this.environment=e.environment!==null?e.environment.clone():null,this.fog=e.fog!==null?e.fog.clone():null,this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),this.overrideMaterial=e.overrideMaterial!==null?e.overrideMaterial.clone():null,this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),t.object.backgroundBlurriness=this.backgroundBlurriness,t.object.backgroundIntensity=this.backgroundIntensity,t.object.backgroundRotation=this.backgroundRotation.toArray(),t.object.environmentIntensity=this.environmentIntensity,t.object.environmentRotation=this.environmentRotation.toArray(),t}},En=new D,qn=new D,Al=new D,Xn=new D,ls=new D,cs=new D,Zu=new D,Rl=new D,Cl=new D,Il=new D,Pl=new Ye,Nl=new Ye,Ll=new Ye,vi=class i{constructor(e=new D,t=new D,n=new D){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,s){s.subVectors(n,t),En.subVectors(e,t),s.cross(En);let r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(e,t,n,s,r){En.subVectors(s,t),qn.subVectors(n,t),Al.subVectors(e,t);let a=En.dot(En),o=En.dot(qn),l=En.dot(Al),c=qn.dot(qn),u=qn.dot(Al),h=a*c-o*o;if(h===0)return r.set(0,0,0),null;let d=1/h,f=(c*l-o*u)*d,g=(a*u-o*l)*d;return r.set(1-f-g,g,f)}static containsPoint(e,t,n,s){return this.getBarycoord(e,t,n,s,Xn)===null?!1:Xn.x>=0&&Xn.y>=0&&Xn.x+Xn.y<=1}static getInterpolation(e,t,n,s,r,a,o,l){return this.getBarycoord(e,t,n,s,Xn)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,Xn.x),l.addScaledVector(a,Xn.y),l.addScaledVector(o,Xn.z),l)}static getInterpolatedAttribute(e,t,n,s,r,a){return Pl.setScalar(0),Nl.setScalar(0),Ll.setScalar(0),Pl.fromBufferAttribute(e,t),Nl.fromBufferAttribute(e,n),Ll.fromBufferAttribute(e,s),a.setScalar(0),a.addScaledVector(Pl,r.x),a.addScaledVector(Nl,r.y),a.addScaledVector(Ll,r.z),a}static isFrontFacing(e,t,n,s){return En.subVectors(n,t),qn.subVectors(e,t),En.cross(qn).dot(s)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,s){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[s]),this}setFromAttributeAndIndices(e,t,n,s){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,s),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return En.subVectors(this.c,this.b),qn.subVectors(this.a,this.b),En.cross(qn).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return i.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return i.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,n,s,r){return i.getInterpolation(e,this.a,this.b,this.c,t,n,s,r)}containsPoint(e){return i.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return i.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,s=this.b,r=this.c,a,o;ls.subVectors(s,n),cs.subVectors(r,n),Rl.subVectors(e,n);let l=ls.dot(Rl),c=cs.dot(Rl);if(l<=0&&c<=0)return t.copy(n);Cl.subVectors(e,s);let u=ls.dot(Cl),h=cs.dot(Cl);if(u>=0&&h<=u)return t.copy(s);let d=l*h-u*c;if(d<=0&&l>=0&&u<=0&&l-u>0)return a=l/(l-u),t.copy(n).addScaledVector(ls,a);Il.subVectors(e,r);let f=ls.dot(Il),g=cs.dot(Il);if(g>=0&&f<=g)return t.copy(r);let _=f*c-l*g;if(_<=0&&c>=0&&g<=0)return o=c/(c-g),t.copy(n).addScaledVector(cs,o);let m=u*g-f*h;if(m<=0&&h-u>=0&&f-g>=0)return Zu.subVectors(r,s),o=(h-u)/(h-u+(f-g)),t.copy(s).addScaledVector(Zu,o);let p=1/(m+_+d);return a=_*p,o=d*p,t.copy(n).addScaledVector(ls,a).addScaledVector(cs,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},Ht=class{constructor(e=new D(1/0,1/0,1/0),t=new D(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(An.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(An.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=An.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let n=e.geometry;if(n!==void 0){let r=n.getAttribute("position");if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0&&e.isBatchedMesh!==!0)for(let a=0,o=r.count;a<o;a++)e.isMesh===!0?e.getVertexPosition(a,An):An.fromBufferAttribute(r,a),An.applyMatrix4(e.matrixWorld),this.expandByPoint(An);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),ya.copy(e.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),ya.copy(n.boundingBox)),ya.applyMatrix4(e.matrixWorld),this.union(ya)}let s=e.children;for(let r=0,a=s.length;r<a;r++)this.expandByObject(s[r],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,An),An.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(sr),va.subVectors(this.max,sr),us.subVectors(e.a,sr),hs.subVectors(e.b,sr),ds.subVectors(e.c,sr),mi.subVectors(hs,us),gi.subVectors(ds,hs),Pi.subVectors(us,ds);let t=[0,-mi.z,mi.y,0,-gi.z,gi.y,0,-Pi.z,Pi.y,mi.z,0,-mi.x,gi.z,0,-gi.x,Pi.z,0,-Pi.x,-mi.y,mi.x,0,-gi.y,gi.x,0,-Pi.y,Pi.x,0];return!Ul(t,us,hs,ds,va)||(t=[1,0,0,0,1,0,0,0,1],!Ul(t,us,hs,ds,va))?!1:(_a.crossVectors(mi,gi),t=[_a.x,_a.y,_a.z],Ul(t,us,hs,ds,va))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,An).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(An).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(Kn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),Kn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),Kn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),Kn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),Kn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),Kn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),Kn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),Kn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(Kn),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}},Kn=[new D,new D,new D,new D,new D,new D,new D,new D],An=new D,ya=new Ht,us=new D,hs=new D,ds=new D,mi=new D,gi=new D,Pi=new D,sr=new D,va=new D,_a=new D,Ni=new D;function Ul(i,e,t,n,s){for(let r=0,a=i.length-3;r<=a;r+=3){Ni.fromArray(i,r);let o=s.x*Math.abs(Ni.x)+s.y*Math.abs(Ni.y)+s.z*Math.abs(Ni.z),l=e.dot(Ni),c=t.dot(Ni),u=n.dot(Ni);if(Math.max(-Math.max(l,c,u),Math.min(l,c,u))>o)return!1}return!0}var bt=new D,Sa=new Ee,Vf=0,Bt=class extends Un{constructor(e,t,n=!1){if(super(),Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Vf++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=_c,this.updateRanges=[],this.gpuType=fn,this.version=0,this._normalizationScale=e!==void 0?$o(e):void 0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this._normalizationScale=e._normalizationScale,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[e+s]=t.array[n+s];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)Sa.fromBufferAttribute(this,t),Sa.applyMatrix3(e),this.setXY(t,Sa.x,Sa.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)bt.fromBufferAttribute(this,t),bt.applyMatrix3(e),this.setXYZ(t,bt.x,bt.y,bt.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)bt.fromBufferAttribute(this,t),bt.applyMatrix4(e),this.setXYZ(t,bt.x,bt.y,bt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)bt.fromBufferAttribute(this,t),bt.applyNormalMatrix(e),this.setXYZ(t,bt.x,bt.y,bt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)bt.fromBufferAttribute(this,t),bt.transformDirection(e),this.setXYZ(t,bt.x,bt.y,bt.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=this._denormalize(n)),n}setComponent(e,t,n){return this.normalized&&(n=this._normalize(n)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=this._denormalize(t)),t}setX(e,t){return this.normalized&&(t=this._normalize(t)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=this._denormalize(t)),t}setY(e,t){return this.normalized&&(t=this._normalize(t)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=this._denormalize(t)),t}setZ(e,t){return this.normalized&&(t=this._normalize(t)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=this._denormalize(t)),t}setW(e,t){return this.normalized&&(t=this._normalize(t)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=this._normalize(t),n=this._normalize(n)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,s){return e*=this.itemSize,this.normalized&&(t=this._normalize(t),n=this._normalize(n),s=this._normalize(s)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=s,this}setXYZW(e,t,n,s,r){return e*=this.itemSize,this.normalized&&(t=this._normalize(t),n=this._normalize(n),s=this._normalize(s),r=this._normalize(r)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=s,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return e.name=this.name,e.usage=this.usage,e.gpuType=this.gpuType,e}dispose(){this.dispatchEvent({type:"dispose"})}_denormalize(e){let t=this._normalizationScale;return t!==void 0?Math.max(e/t,-1):Tc(e,this.array)}_normalize(e){let t=this._normalizationScale;return t!==void 0?Math.round(e*t):wc(e,this.array)}};var xr=class extends Bt{constructor(e,t,n){super(new Uint16Array(e),t,n)}};var yr=class extends Bt{constructor(e,t,n){super(new Uint32Array(e),t,n)}};var $e=class extends Bt{constructor(e,t,n){super(new Float32Array(e),t,n)}},kf=new Ht,rr=new D,Dl=new D,nn=class{constructor(e=new D,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;t!==void 0?n.copy(t):kf.setFromPoints(e).getCenter(n);let s=0;for(let r=0,a=e.length;r<a;r++)s=Math.max(s,n.distanceToSquared(e[r]));return this.radius=Math.sqrt(s),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;rr.subVectors(e,this.center);let t=rr.lengthSq();if(t>this.radius*this.radius){let n=Math.sqrt(t),s=(n-this.radius)*.5;this.center.addScaledVector(rr,s/n),this.radius+=s}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(Dl.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(rr.copy(e.center).add(Dl)),this.expandByPoint(rr.copy(e.center).sub(Dl))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}},zf=0,vn=new Le,Ol=new ht,fs=new D,un=new Ht,ar=new Ht,Ut=new D,gt=class i extends Un{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:zf++}),this.uuid=Bn(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(df(e)?yr:xr)(e,1):this.index=e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new Ue().getNormalMatrix(e);n.applyNormalMatrix(r),n.needsUpdate=!0}let s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(e),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(e){return vn.makeRotationFromQuaternion(e),this.applyMatrix4(vn),this}rotateX(e){return vn.makeRotationX(e),this.applyMatrix4(vn),this}rotateY(e){return vn.makeRotationY(e),this.applyMatrix4(vn),this}rotateZ(e){return vn.makeRotationZ(e),this.applyMatrix4(vn),this}translate(e,t,n){return vn.makeTranslation(e,t,n),this.applyMatrix4(vn),this}scale(e,t,n){return vn.makeScale(e,t,n),this.applyMatrix4(vn),this}lookAt(e){return Ol.lookAt(e),Ol.updateMatrix(),this.applyMatrix4(Ol.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(fs).negate(),this.translate(fs.x,fs.y,fs.z),this}setFromPoints(e){let t=this.getAttribute("position");if(t===void 0){let n=[];for(let s=0,r=e.length;s<r;s++){let a=e[s];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new $e(n,3))}else{let n=Math.min(e.length,t.count);for(let s=0;s<n;s++){let r=e[s];t.setXYZ(s,r.x,r.y,r.z||0)}e.length>t.count&&be("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Ht);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){Ne("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new D(-1/0,-1/0,-1/0),new D(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,s=t.length;n<s;n++){let r=t[n];un.setFromBufferAttribute(r),this.morphTargetsRelative?(Ut.addVectors(this.boundingBox.min,un.min),this.boundingBox.expandByPoint(Ut),Ut.addVectors(this.boundingBox.max,un.max),this.boundingBox.expandByPoint(Ut)):(this.boundingBox.expandByPoint(un.min),this.boundingBox.expandByPoint(un.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&Ne('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new nn);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){Ne("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new D,1/0);return}if(e){let n=this.boundingSphere.center;if(un.setFromBufferAttribute(e),t)for(let r=0,a=t.length;r<a;r++){let o=t[r];ar.setFromBufferAttribute(o),this.morphTargetsRelative?(Ut.addVectors(un.min,ar.min),un.expandByPoint(Ut),Ut.addVectors(un.max,ar.max),un.expandByPoint(Ut)):(un.expandByPoint(ar.min),un.expandByPoint(ar.max))}un.getCenter(n);let s=0;for(let r=0,a=e.count;r<a;r++)Ut.fromBufferAttribute(e,r),s=Math.max(s,n.distanceToSquared(Ut));if(t)for(let r=0,a=t.length;r<a;r++){let o=t[r],l=this.morphTargetsRelative;for(let c=0,u=o.count;c<u;c++)Ut.fromBufferAttribute(o,c),l&&(fs.fromBufferAttribute(e,c),Ut.add(fs)),s=Math.max(s,n.distanceToSquared(Ut))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&Ne('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){Ne("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=t.position,s=t.normal,r=t.uv,a=this.getAttribute("tangent");(a===void 0||a.count!==n.count)&&(a=new Bt(new Float32Array(4*n.count),4),this.setAttribute("tangent",a));let o=[],l=[],c=new Uint8Array(n.count);for(let N=0;N<n.count;N++)o[N]=new D,l[N]=new D;let u=new D,h=new D,d=new D,f=new Ee,g=new Ee,_=new Ee,m=new D,p=new D;function y(N,C,P){c[N]=c[C]=c[P]=1,u.fromBufferAttribute(n,N),h.fromBufferAttribute(n,C),d.fromBufferAttribute(n,P),f.fromBufferAttribute(r,N),g.fromBufferAttribute(r,C),_.fromBufferAttribute(r,P),h.sub(u),d.sub(u),g.sub(f),_.sub(f);let F=1/(g.x*_.y-_.x*g.y);isFinite(F)&&(m.copy(h).multiplyScalar(_.y).addScaledVector(d,-g.y).multiplyScalar(F),p.copy(d).multiplyScalar(g.x).addScaledVector(h,-_.x).multiplyScalar(F),o[N].add(m),o[C].add(m),o[P].add(m),l[N].add(p),l[C].add(p),l[P].add(p))}let w=this.groups;w.length===0&&(w=[{start:0,count:e.count}]);for(let N=0,C=w.length;N<C;++N){let P=w[N],F=P.start,G=P.count;for(let A=F,U=F+G;A<U;A+=3)y(e.getX(A+0),e.getX(A+1),e.getX(A+2))}let M=new D,b=new D,E=new D,x=new D;function T(N){E.fromBufferAttribute(s,N),x.copy(E);let C=o[N];M.copy(C),M.sub(E.multiplyScalar(E.dot(C))).normalize(),b.crossVectors(x,C);let F=b.dot(l[N])<0?-1:1;a.setXYZW(N,M.x,M.y,M.z,F)}for(let N=0,C=n.count;N<C;++N)c[N]&&T(N);this._transformed=!0}computeVertexNormals(){let e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==t.count)n=new Bt(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let d=0,f=n.count;d<f;d++)n.setXYZ(d,0,0,0);let s=new D,r=new D,a=new D,o=new D,l=new D,c=new D,u=new D,h=new D;if(e)for(let d=0,f=e.count;d<f;d+=3){let g=e.getX(d+0),_=e.getX(d+1),m=e.getX(d+2);s.fromBufferAttribute(t,g),r.fromBufferAttribute(t,_),a.fromBufferAttribute(t,m),u.subVectors(a,r),h.subVectors(s,r),u.cross(h),o.fromBufferAttribute(n,g),l.fromBufferAttribute(n,_),c.fromBufferAttribute(n,m),o.add(u),l.add(u),c.add(u),n.setXYZ(g,o.x,o.y,o.z),n.setXYZ(_,l.x,l.y,l.z),n.setXYZ(m,c.x,c.y,c.z)}else for(let d=0,f=t.count;d<f;d+=3)s.fromBufferAttribute(t,d+0),r.fromBufferAttribute(t,d+1),a.fromBufferAttribute(t,d+2),u.subVectors(a,r),h.subVectors(s,r),u.cross(h),n.setXYZ(d+0,u.x,u.y,u.z),n.setXYZ(d+1,u.x,u.y,u.z),n.setXYZ(d+2,u.x,u.y,u.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)Ut.fromBufferAttribute(e,t),Ut.normalize(),e.setXYZ(t,Ut.x,Ut.y,Ut.z)}toNonIndexed(){function e(o,l){let c=o.array,u=o.itemSize,h=o.normalized,d=new c.constructor(l.length*u),f=0,g=0;for(let _=0,m=l.length;_<m;_++){o.isInterleavedBufferAttribute?f=l[_]*o.data.stride+o.offset:f=l[_]*u;for(let p=0;p<u;p++)d[g++]=c[f++]}return new Bt(d,u,h)}if(this.index===null)return be("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let t=new i,n=this.index.array,s=this.attributes;for(let o in s){let l=s[o],c=e(l,n);t.setAttribute(o,c)}let r=this.morphAttributes;for(let o in r){let l=[],c=r[o];for(let u=0,h=c.length;u<h;u++){let d=c[u],f=e(d,n);l.push(f)}t.morphAttributes[o]=l}t.morphTargetsRelative=this.morphTargetsRelative;let a=this.groups;for(let o=0,l=a.length;o<l;o++){let c=a[o];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){let e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,e.name=this.name,Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(e[c]=l[c]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let n=this.attributes;for(let l in n){let c=n[l];e.data.attributes[l]=c.toJSON(e.data)}let s={},r=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],u=[];for(let h=0,d=c.length;h<d;h++){let f=c[h];u.push(f.toJSON(e.data))}u.length>0&&(s[l]=u,r=!0)}r&&(e.data.morphAttributes=s,e.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;n!==null&&this.setIndex(n.clone());let s=e.attributes;for(let c in s){let u=s[c];this.setAttribute(c,u.clone(t))}let r=e.morphAttributes;for(let c in r){let u=[],h=r[c];for(let d=0,f=h.length;d<f;d++)u.push(h[d].clone(t));this.morphAttributes[c]=u}this.morphTargetsRelative=e.morphTargetsRelative;let a=e.groups;for(let c=0,u=a.length;c<u;c++){let h=a[c];this.addGroup(h.start,h.count,h.materialIndex)}let o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());let l=e.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this._transformed=e._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}},Cs=class{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=_c,this.updateRanges=[],this.version=0,this.uuid=Bn()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let s=0,r=this.stride;s<r;s++)this.array[e+s]=t.array[n+s];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={});let t=Yu(this.array);e.arrayBuffers[t]===void 0&&(e.arrayBuffers[t]=this.array.slice(0).buffer);let n=new this.array.constructor(e.arrayBuffers[t]),s=new this.constructor(n,this.stride);return s.setUsage(this.usage),s}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){e.arrayBuffers===void 0&&(e.arrayBuffers={});let t=Yu(this.array);e.arrayBuffers[t]===void 0&&(e.arrayBuffers[t]=Array.from(new Uint32Array(this.array.slice(0).buffer)));let n={uuid:this.uuid,buffer:t,type:this.array.constructor.name,stride:this.stride};return n.usage=this.usage,n}};function Yu(i){return i.buffer._uuid===void 0&&(i.buffer._uuid=Bn()),i.byteOffset===0&&i.byteLength===i.buffer.byteLength?i.buffer._uuid:i.buffer._uuid+":"+i.byteOffset+":"+i.byteLength}var Zt=new D,Is=class i{constructor(e,t,n,s=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=n,this.normalized=s,this._normalizationScale=e!==void 0?$o(e.array):void 0}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)Zt.fromBufferAttribute(this,t),Zt.applyMatrix4(e),this.setXYZ(t,Zt.x,Zt.y,Zt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Zt.fromBufferAttribute(this,t),Zt.applyNormalMatrix(e),this.setXYZ(t,Zt.x,Zt.y,Zt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Zt.fromBufferAttribute(this,t),Zt.transformDirection(e),this.setXYZ(t,Zt.x,Zt.y,Zt.z);return this}getComponent(e,t){let n=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(n=this._denormalize(n)),n}setComponent(e,t,n){return this.normalized&&(n=this._normalize(n)),this.data.array[e*this.data.stride+this.offset+t]=n,this}setX(e,t){return this.normalized&&(t=this._normalize(t)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=this._normalize(t)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=this._normalize(t)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=this._normalize(t)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=this._denormalize(t)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=this._denormalize(t)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=this._denormalize(t)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=this._denormalize(t)),t}setXY(e,t,n){return e=e*this.data.stride+this.offset,this.normalized&&(t=this._normalize(t),n=this._normalize(n)),this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,s){return e=e*this.data.stride+this.offset,this.normalized&&(t=this._normalize(t),n=this._normalize(n),s=this._normalize(s)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=s,this}setXYZW(e,t,n,s,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=this._normalize(t),n=this._normalize(n),s=this._normalize(s),r=this._normalize(r)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=s,this.data.array[e+3]=r,this}clone(e){if(e===void 0){mr("InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let s=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[s+r])}return new Bt(new this.array.constructor(t),this.itemSize,this.normalized)}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new i(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){mr("InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let s=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[s+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}_denormalize(e){let t=this._normalizationScale;return t!==void 0?Math.max(e/t,-1):Tc(e,this.data.array)}_normalize(e){let t=this._normalizationScale;return t!==void 0?Math.round(e*t):wc(e,this.data.array)}},Fl=new D,Gf=new D,Hf=new Ue,tn=class{constructor(e=new D(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,s){return this.normal.set(e,t,n),this.constant=s,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let s=Fl.subVectors(n,t).cross(Gf.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(s,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t,n=!0){let s=e.delta(Fl),r=this.normal.dot(s);if(r===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let a=-(e.start.dot(this.normal)+this.constant)/r;return n===!0&&(a<0||a>1)?null:t.copy(e.start).addScaledVector(s,a)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||Hf.getNormalMatrix(e),s=this.coplanarPoint(Fl).applyMatrix4(e),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(e){return this.normal.fromArray(e.normal),this.constant=e.constant,this}},Wf=0,sn=class extends Un{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Wf++}),this.uuid=Bn(),this.name="",this.type="Material",this.blending=Vs,this.side=Mn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=oc,this.blendDst=Vr,this.blendEquation=Xi,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Te(0,0,0),this.blendAlpha=0,this.depthFunc=vs,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=Yh,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=za,this.stencilZFail=za,this.stencilZPass=za,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let n=e[t];if(n===void 0){be(`Material: parameter '${t}' has value of undefined.`);continue}let s=this[t];if(s===void 0){be(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector2&&n&&n.isVector2||s&&s.isEuler&&n&&n.isEuler||s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});let n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,n.blending=this.blending,n.side=this.side,n.shadowSide=this.shadowSide,n.vertexColors=this.vertexColors,n.opacity=this.opacity,n.transparent=this.transparent,n.blendSrc=this.blendSrc,n.blendDst=this.blendDst,n.blendEquation=this.blendEquation,n.blendSrcAlpha=this.blendSrcAlpha,n.blendDstAlpha=this.blendDstAlpha,n.blendEquationAlpha=this.blendEquationAlpha,n.blendColor=this.blendColor.getHex(),n.blendAlpha=this.blendAlpha,n.depthFunc=this.depthFunc,n.depthTest=this.depthTest,n.depthWrite=this.depthWrite,n.colorWrite=this.colorWrite,n.clipIntersection=this.clipIntersection,n.clipShadows=this.clipShadows,n.stencilWriteMask=this.stencilWriteMask,n.stencilFunc=this.stencilFunc,n.stencilRef=this.stencilRef,n.stencilFuncMask=this.stencilFuncMask,n.stencilFail=this.stencilFail,n.stencilZFail=this.stencilZFail,n.stencilZPass=this.stencilZPass,n.stencilWrite=this.stencilWrite,n.polygonOffset=this.polygonOffset,n.polygonOffsetFactor=this.polygonOffsetFactor,n.polygonOffsetUnits=this.polygonOffsetUnits,n.dithering=this.dithering,n.alphaTest=this.alphaTest,n.alphaHash=this.alphaHash,n.alphaToCoverage=this.alphaToCoverage,n.premultipliedAlpha=this.premultipliedAlpha,n.forceSinglePass=this.forceSinglePass,n.allowOverride=this.allowOverride,n.visible=this.visible,n.toneMapped=this.toneMapped,n.name=this.name,this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.diffuseRoughness!==void 0&&(n.diffuseRoughness=this.diffuseRoughness),this.diffuseRoughnessMap&&this.diffuseRoughnessMap.isTexture&&(n.diffuseRoughnessMap=this.diffuseRoughnessMap.toJSON(e).uuid),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.retroreflectivity!==void 0&&(n.retroreflectivity=this.retroreflectivity),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessMinimum!==void 0&&(n.iridescenceThicknessMinimum=this.iridescenceThicknessMinimum),this.iridescenceThicknessMaximum!==void 0&&(n.iridescenceThicknessMaximum=this.iridescenceThicknessMaximum),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0&&(n.clippingPlanes=this.clippingPlanes.map(r=>r.toJSON())),this.rotation!==void 0&&(n.rotation=this.rotation),this.depthPacking!==void 0&&(n.depthPacking=this.depthPacking),this.linewidth!==void 0&&(n.linewidth=this.linewidth),this.linecap!==void 0&&(n.linecap=this.linecap),this.linejoin!==void 0&&(n.linejoin=this.linejoin),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.wireframe!==void 0&&(n.wireframe=this.wireframe),this.wireframeLinewidth!==void 0&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==void 0&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==void 0&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading!==void 0&&(n.flatShading=this.flatShading),this.fog!==void 0&&(n.fog=this.fog),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){let a=[];for(let o in r){let l=r[o];delete l.metadata,a.push(l)}return a}if(t){let r=s(e.textures),a=s(e.images);r.length>0&&(n.textures=r),a.length>0&&(n.images=a)}return n}fromJSON(e,t){if(e.uuid!==void 0&&(this.uuid=e.uuid),e.name!==void 0&&(this.name=e.name),e.color!==void 0&&this.color!==void 0&&this.color.setHex(e.color),e.roughness!==void 0&&(this.roughness=e.roughness),e.metalness!==void 0&&(this.metalness=e.metalness),e.sheen!==void 0&&(this.sheen=e.sheen),e.sheenColor!==void 0&&(this.sheenColor=new Te().setHex(e.sheenColor)),e.sheenRoughness!==void 0&&(this.sheenRoughness=e.sheenRoughness),e.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(e.emissive),e.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(e.specular),e.specularIntensity!==void 0&&(this.specularIntensity=e.specularIntensity),e.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(e.specularColor),e.shininess!==void 0&&(this.shininess=e.shininess),e.clearcoat!==void 0&&(this.clearcoat=e.clearcoat),e.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=e.clearcoatRoughness),e.diffuseRoughness!==void 0&&(this.diffuseRoughness=e.diffuseRoughness),e.dispersion!==void 0&&(this.dispersion=e.dispersion),e.retroreflectivity!==void 0&&(this.retroreflectivity=e.retroreflectivity),e.iridescence!==void 0&&(this.iridescence=e.iridescence),e.iridescenceIOR!==void 0&&(this.iridescenceIOR=e.iridescenceIOR),e.iridescenceThicknessMinimum!==void 0&&(this.iridescenceThicknessMinimum=e.iridescenceThicknessMinimum),e.iridescenceThicknessMaximum!==void 0&&(this.iridescenceThicknessMaximum=e.iridescenceThicknessMaximum),e.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessMinimum=e.iridescenceThicknessRange[0],this.iridescenceThicknessMaximum=e.iridescenceThicknessRange[1]),e.transmission!==void 0&&(this.transmission=e.transmission),e.thickness!==void 0&&(this.thickness=e.thickness),e.attenuationDistance!==void 0&&(this.attenuationDistance=e.attenuationDistance),e.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(e.attenuationColor),e.anisotropy!==void 0&&(this.anisotropy=e.anisotropy),e.anisotropyRotation!==void 0&&(this.anisotropyRotation=e.anisotropyRotation),e.fog!==void 0&&(this.fog=e.fog),e.flatShading!==void 0&&(this.flatShading=e.flatShading),e.blending!==void 0&&(this.blending=e.blending),e.combine!==void 0&&(this.combine=e.combine),e.side!==void 0&&(this.side=e.side),e.shadowSide!==void 0&&(this.shadowSide=e.shadowSide),e.opacity!==void 0&&(this.opacity=e.opacity),e.transparent!==void 0&&(this.transparent=e.transparent),e.alphaTest!==void 0&&(this.alphaTest=e.alphaTest),e.alphaHash!==void 0&&(this.alphaHash=e.alphaHash),e.depthFunc!==void 0&&(this.depthFunc=e.depthFunc),e.depthTest!==void 0&&(this.depthTest=e.depthTest),e.depthWrite!==void 0&&(this.depthWrite=e.depthWrite),e.colorWrite!==void 0&&(this.colorWrite=e.colorWrite),e.clippingPlanes!==void 0&&(this.clippingPlanes=e.clippingPlanes.map(n=>new tn().fromJSON(n))),e.clipIntersection!==void 0&&(this.clipIntersection=e.clipIntersection),e.clipShadows!==void 0&&(this.clipShadows=e.clipShadows),e.depthPacking!==void 0&&(this.depthPacking=e.depthPacking),e.blendSrc!==void 0&&(this.blendSrc=e.blendSrc),e.blendDst!==void 0&&(this.blendDst=e.blendDst),e.blendEquation!==void 0&&(this.blendEquation=e.blendEquation),e.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=e.blendSrcAlpha),e.blendDstAlpha!==void 0&&(this.blendDstAlpha=e.blendDstAlpha),e.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=e.blendEquationAlpha),e.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(e.blendColor),e.blendAlpha!==void 0&&(this.blendAlpha=e.blendAlpha),e.stencilWriteMask!==void 0&&(this.stencilWriteMask=e.stencilWriteMask),e.stencilFunc!==void 0&&(this.stencilFunc=e.stencilFunc),e.stencilRef!==void 0&&(this.stencilRef=e.stencilRef),e.stencilFuncMask!==void 0&&(this.stencilFuncMask=e.stencilFuncMask),e.stencilFail!==void 0&&(this.stencilFail=e.stencilFail),e.stencilZFail!==void 0&&(this.stencilZFail=e.stencilZFail),e.stencilZPass!==void 0&&(this.stencilZPass=e.stencilZPass),e.stencilWrite!==void 0&&(this.stencilWrite=e.stencilWrite),e.wireframe!==void 0&&(this.wireframe=e.wireframe),e.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=e.wireframeLinewidth),e.wireframeLinecap!==void 0&&(this.wireframeLinecap=e.wireframeLinecap),e.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=e.wireframeLinejoin),e.rotation!==void 0&&(this.rotation=e.rotation),e.linewidth!==void 0&&(this.linewidth=e.linewidth),e.linecap!==void 0&&(this.linecap=e.linecap),e.linejoin!==void 0&&(this.linejoin=e.linejoin),e.dashSize!==void 0&&(this.dashSize=e.dashSize),e.gapSize!==void 0&&(this.gapSize=e.gapSize),e.scale!==void 0&&(this.scale=e.scale),e.polygonOffset!==void 0&&(this.polygonOffset=e.polygonOffset),e.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=e.polygonOffsetFactor),e.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=e.polygonOffsetUnits),e.dithering!==void 0&&(this.dithering=e.dithering),e.alphaToCoverage!==void 0&&(this.alphaToCoverage=e.alphaToCoverage),e.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=e.premultipliedAlpha),e.forceSinglePass!==void 0&&(this.forceSinglePass=e.forceSinglePass),e.allowOverride!==void 0&&(this.allowOverride=e.allowOverride),e.visible!==void 0&&(this.visible=e.visible),e.toneMapped!==void 0&&(this.toneMapped=e.toneMapped),e.userData!==void 0&&(this.userData=e.userData),e.vertexColors!==void 0&&(typeof e.vertexColors=="number"?this.vertexColors=e.vertexColors>0:this.vertexColors=e.vertexColors),e.size!==void 0&&(this.size=e.size),e.sizeAttenuation!==void 0&&(this.sizeAttenuation=e.sizeAttenuation),e.map!==void 0&&(this.map=t[e.map]||null),e.matcap!==void 0&&(this.matcap=t[e.matcap]||null),e.alphaMap!==void 0&&(this.alphaMap=t[e.alphaMap]||null),e.bumpMap!==void 0&&(this.bumpMap=t[e.bumpMap]||null),e.bumpScale!==void 0&&(this.bumpScale=e.bumpScale),e.normalMap!==void 0&&(this.normalMap=t[e.normalMap]||null),e.normalMapType!==void 0&&(this.normalMapType=e.normalMapType),e.normalScale!==void 0){let n=e.normalScale;Array.isArray(n)===!1&&(n=[n,n]),this.normalScale=new Ee().fromArray(n)}return e.displacementMap!==void 0&&(this.displacementMap=t[e.displacementMap]||null),e.displacementScale!==void 0&&(this.displacementScale=e.displacementScale),e.displacementBias!==void 0&&(this.displacementBias=e.displacementBias),e.roughnessMap!==void 0&&(this.roughnessMap=t[e.roughnessMap]||null),e.metalnessMap!==void 0&&(this.metalnessMap=t[e.metalnessMap]||null),e.emissiveMap!==void 0&&(this.emissiveMap=t[e.emissiveMap]||null),e.emissiveIntensity!==void 0&&(this.emissiveIntensity=e.emissiveIntensity),e.specularMap!==void 0&&(this.specularMap=t[e.specularMap]||null),e.specularIntensityMap!==void 0&&(this.specularIntensityMap=t[e.specularIntensityMap]||null),e.specularColorMap!==void 0&&(this.specularColorMap=t[e.specularColorMap]||null),e.envMap!==void 0&&(this.envMap=t[e.envMap]||null),e.envMapRotation!==void 0&&this.envMapRotation.fromArray(e.envMapRotation),e.envMapIntensity!==void 0&&(this.envMapIntensity=e.envMapIntensity),e.reflectivity!==void 0&&(this.reflectivity=e.reflectivity),e.refractionRatio!==void 0&&(this.refractionRatio=e.refractionRatio),e.lightMap!==void 0&&(this.lightMap=t[e.lightMap]||null),e.lightMapIntensity!==void 0&&(this.lightMapIntensity=e.lightMapIntensity),e.aoMap!==void 0&&(this.aoMap=t[e.aoMap]||null),e.aoMapIntensity!==void 0&&(this.aoMapIntensity=e.aoMapIntensity),e.gradientMap!==void 0&&(this.gradientMap=t[e.gradientMap]||null),e.clearcoatMap!==void 0&&(this.clearcoatMap=t[e.clearcoatMap]||null),e.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=t[e.clearcoatRoughnessMap]||null),e.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=t[e.clearcoatNormalMap]||null),e.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new Ee().fromArray(e.clearcoatNormalScale)),e.diffuseRoughnessMap!==void 0&&(this.diffuseRoughnessMap=t[e.diffuseRoughnessMap]||null),e.iridescenceMap!==void 0&&(this.iridescenceMap=t[e.iridescenceMap]||null),e.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=t[e.iridescenceThicknessMap]||null),e.transmissionMap!==void 0&&(this.transmissionMap=t[e.transmissionMap]||null),e.thicknessMap!==void 0&&(this.thicknessMap=t[e.thicknessMap]||null),e.anisotropyMap!==void 0&&(this.anisotropyMap=t[e.anisotropyMap]||null),e.sheenColorMap!==void 0&&(this.sheenColorMap=t[e.sheenColorMap]||null),e.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=t[e.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,n=null;if(t!==null){let s=t.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}};var jn=new D,Bl=new D,Ma=new D,ba=new D,_i=class{constructor(e=new D,t=new D(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,jn)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=jn.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(jn.copy(this.origin).addScaledVector(this.direction,t),jn.distanceToSquared(e))}distanceSqToSegment(e,t,n,s){Bl.copy(e).add(t).multiplyScalar(.5),Ma.copy(t).sub(e).normalize(),ba.copy(this.origin).sub(Bl);let r=e.distanceTo(t)*.5,a=-this.direction.dot(Ma),o=ba.dot(this.direction),l=-ba.dot(Ma),c=ba.lengthSq(),u=Math.abs(1-a*a),h,d,f,g;if(u>0)if(h=a*l-o,d=a*o-l,g=r*u,h>=0)if(d>=-g)if(d<=g){let _=1/u;h*=_,d*=_,f=h*(h+a*d+2*o)+d*(a*h+d+2*l)+c}else d=r,h=Math.max(0,-(a*d+o)),f=-h*h+d*(d+2*l)+c;else d=-r,h=Math.max(0,-(a*d+o)),f=-h*h+d*(d+2*l)+c;else d<=-g?(h=Math.max(0,-(-a*r+o)),d=h>0?-r:Math.min(Math.max(-r,-l),r),f=-h*h+d*(d+2*l)+c):d<=g?(h=0,d=Math.min(Math.max(-r,-l),r),f=d*(d+2*l)+c):(h=Math.max(0,-(a*r+o)),d=h>0?r:Math.min(Math.max(-r,-l),r),f=-h*h+d*(d+2*l)+c);else d=a>0?-r:r,h=Math.max(0,-(a*d+o)),f=-h*h+d*(d+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,h),s&&s.copy(Bl).addScaledVector(Ma,d),f}intersectSphere(e,t){if(e.radius<0)return null;jn.subVectors(e.center,this.origin);let n=jn.dot(this.direction),s=jn.dot(jn)-n*n,r=e.radius*e.radius;if(s>r)return null;let a=Math.sqrt(r-s),o=n-a,l=n+a;return l<0?null:o<0?this.at(l,t):this.at(o,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,s,r,a,o,l,c=1/this.direction.x,u=1/this.direction.y,h=1/this.direction.z,d=this.origin;return c>=0?(n=(e.min.x-d.x)*c,s=(e.max.x-d.x)*c):(n=(e.max.x-d.x)*c,s=(e.min.x-d.x)*c),u>=0?(r=(e.min.y-d.y)*u,a=(e.max.y-d.y)*u):(r=(e.max.y-d.y)*u,a=(e.min.y-d.y)*u),n>a||r>s||((r>n||isNaN(n))&&(n=r),(a<s||isNaN(s))&&(s=a),h>=0?(o=(e.min.z-d.z)*h,l=(e.max.z-d.z)*h):(o=(e.max.z-d.z)*h,l=(e.min.z-d.z)*h),n>l||o>s)||((o>n||n!==n)&&(n=o),(l<s||s!==s)&&(s=l),s<0)?null:this.at(n>=0?n:s,t)}intersectsBox(e){return this.intersectBox(e,jn)!==null}intersectTriangle(e,t,n,s,r){let a=this.origin,o=this.direction,l=o.x,c=o.y,u=o.z,h=e.x-a.x,d=e.y-a.y,f=e.z-a.z,g=t.x-a.x,_=t.y-a.y,m=t.z-a.z,p=n.x-a.x,y=n.y-a.y,w=n.z-a.z,M=Math.abs(l),b=Math.abs(c),E=Math.abs(u),x,T,N,C,P,F,G,A,U,B,V,$;if(M>=b&&M>=E?(N=l,F=h,U=g,$=p,l>=0?(x=c,T=u,C=d,P=f,G=_,A=m,B=y,V=w):(x=u,T=c,C=f,P=d,G=m,A=_,B=w,V=y)):b>=E?(N=c,F=d,U=_,$=y,c>=0?(x=u,T=l,C=f,P=h,G=m,A=g,B=w,V=p):(x=l,T=u,C=h,P=f,G=g,A=m,B=p,V=w)):(N=u,F=f,U=m,$=w,u>=0?(x=l,T=c,C=h,P=d,G=g,A=_,B=p,V=y):(x=c,T=l,C=d,P=h,G=_,A=g,B=y,V=p)),N===0)return null;let q=x/N,Q=T/N,ee=1/N,ve=C-q*F,Ie=P-Q*F,j=G-q*U,ce=A-Q*U,xe=B-q*$,Re=V-Q*$,fe=xe*ce-Re*j,De=ve*Re-Ie*xe,St=j*Ie-ce*ve;if(s){if(fe<0||De<0||St<0)return null}else if((fe<0||De<0||St<0)&&(fe>0||De>0||St>0))return null;let Pe=fe+De+St;if(Pe===0)return null;let et=ee*(fe*F+De*U+St*$);return(Pe>0?et<0:et>0)?null:this.at(et/Pe,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},Wt=class extends sn{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Te(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Qn,this.combine=lc,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}},Ju=new Le,Li=new _i,Ta=new nn,Qu=new D,wa=new D,Ea=new D,Aa=new D,Vl=new D,Ra=new D,$u=new D,Ca=new D,je=class extends ht{constructor(e=new gt,t=new Wt){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0?this.morphTargetInfluences=e.morphTargetInfluences.slice():this.morphTargetInfluences=void 0,e.morphTargetDictionary!==void 0?this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary):this.morphTargetDictionary=void 0,this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){let o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}getVertexPosition(e,t){let n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,a=n.morphTargetsRelative;t.fromBufferAttribute(s,e);let o=this.morphTargetInfluences;if(r&&o){Ra.set(0,0,0);for(let l=0,c=r.length;l<c;l++){let u=o[l],h=r[l];u!==0&&(Vl.fromBufferAttribute(h,e),a?Ra.addScaledVector(Vl,u):Ra.addScaledVector(Vl.sub(t),u))}t.add(Ra)}return t}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Ta.copy(n.boundingSphere),Ta.applyMatrix4(r),Li.copy(e.ray).recast(e.near),!(Ta.containsPoint(Li.origin)===!1&&(Li.intersectSphere(Ta,Qu)===null||Li.origin.distanceToSquared(Qu)>(e.far-e.near)**2))&&(Ju.copy(r).invert(),Li.copy(e.ray).applyMatrix4(Ju),!(n.boundingBox!==null&&Li.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(e,t,Li)))}_computeIntersections(e,t,n){let s,r=this.geometry,a=this.material,o=r.index,l=r.attributes.position,c=r.attributes.uv,u=r.attributes.uv1,h=r.attributes.normal,d=r.groups,f=r.drawRange;if(o!==null)if(Array.isArray(a))for(let g=0,_=d.length;g<_;g++){let m=d[g],p=a[m.materialIndex],y=Math.max(m.start,f.start),w=Math.min(o.count,Math.min(m.start+m.count,f.start+f.count));for(let M=y,b=w;M<b;M+=3){let E=o.getX(M),x=o.getX(M+1),T=o.getX(M+2);s=Ia(this,p,e,n,c,u,h,E,x,T),s&&(s.faceIndex=Math.floor(M/3),s.face.materialIndex=m.materialIndex,t.push(s))}}else{let g=Math.max(0,f.start),_=Math.min(o.count,f.start+f.count);for(let m=g,p=_;m<p;m+=3){let y=o.getX(m),w=o.getX(m+1),M=o.getX(m+2);s=Ia(this,a,e,n,c,u,h,y,w,M),s&&(s.faceIndex=Math.floor(m/3),t.push(s))}}else if(l!==void 0)if(Array.isArray(a))for(let g=0,_=d.length;g<_;g++){let m=d[g],p=a[m.materialIndex],y=Math.max(m.start,f.start),w=Math.min(l.count,Math.min(m.start+m.count,f.start+f.count));for(let M=y,b=w;M<b;M+=3){let E=M,x=M+1,T=M+2;s=Ia(this,p,e,n,c,u,h,E,x,T),s&&(s.faceIndex=Math.floor(M/3),s.face.materialIndex=m.materialIndex,t.push(s))}}else{let g=Math.max(0,f.start),_=Math.min(l.count,f.start+f.count);for(let m=g,p=_;m<p;m+=3){let y=m,w=m+1,M=m+2;s=Ia(this,a,e,n,c,u,h,y,w,M),s&&(s.faceIndex=Math.floor(m/3),t.push(s))}}}};function qf(i,e,t,n,s,r,a,o){let l;if(e.side===Rt?l=n.intersectTriangle(a,r,s,!0,o):l=n.intersectTriangle(s,r,a,e.side===Mn,o),l===null)return null;Ca.copy(o),Ca.applyMatrix4(i.matrixWorld);let c=t.ray.origin.distanceTo(Ca);return c<t.near||c>t.far?null:{distance:c,point:Ca.clone(),object:i}}function Ia(i,e,t,n,s,r,a,o,l,c){i.getVertexPosition(o,wa),i.getVertexPosition(l,Ea),i.getVertexPosition(c,Aa);let u=qf(i,e,t,n,wa,Ea,Aa,$u);if(u){let h=new D;vi.getBarycoord($u,wa,Ea,Aa,h),s&&(u.uv=vi.getInterpolatedAttribute(s,o,l,c,h,new Ee)),r&&(u.uv1=vi.getInterpolatedAttribute(r,o,l,c,h,new Ee)),a&&(u.normal=vi.getInterpolatedAttribute(a,o,l,c,h,new D),u.normal.dot(n.direction)>0&&u.normal.multiplyScalar(-1));let d={a:o,b:l,c,normal:new D,materialIndex:0};vi.getNormal(wa,Ea,Aa,d.normal),u.face=d,u.barycoord=h}return u}var or=new Ye,eh=new Ye,th=new Ye,Xf=new Ye,nh=new Le,Pa=new D,kl=new nn,ih=new Le,zl=new _i,vr=class extends je{constructor(e,t){super(e,t),this.isSkinnedMesh=!0,this.type="SkinnedMesh",this.bindMode=ql,this.bindMatrix=new Le,this.bindMatrixInverse=new Le,this.boundingBox=null,this.boundingSphere=null}computeBoundingBox(){let e=this.geometry;this.boundingBox===null&&(this.boundingBox=new Ht),this.boundingBox.makeEmpty();let t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,Pa),this.boundingBox.expandByPoint(Pa)}computeBoundingSphere(){let e=this.geometry;this.boundingSphere===null&&(this.boundingSphere=new nn),this.boundingSphere.makeEmpty();let t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,Pa),this.boundingSphere.expandByPoint(Pa)}copy(e,t){return super.copy(e,t),this.bindMode=e.bindMode,this.bindMatrix.copy(e.bindMatrix),this.bindMatrixInverse.copy(e.bindMatrixInverse),this.skeleton=e.skeleton,this.boundingBox=e.boundingBox!==null?e.boundingBox.clone():null,this.boundingSphere=e.boundingSphere!==null?e.boundingSphere.clone():null,this}raycast(e,t){let n=this.material,s=this.matrixWorld;n!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),kl.copy(this.boundingSphere),kl.applyMatrix4(s),e.ray.intersectsSphere(kl)!==!1&&(ih.copy(s).invert(),zl.copy(e.ray).applyMatrix4(ih),!(this.boundingBox!==null&&zl.intersectsBox(this.boundingBox)===!1)&&this._computeIntersections(e,t,zl)))}getVertexPosition(e,t){return super.getVertexPosition(e,t),this.applyBoneTransform(e,t),t}bind(e,t){this.skeleton=e,t===void 0&&(this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),t=this.matrixWorld),this.bindMatrix.copy(t),this.bindMatrixInverse.copy(t).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){let e=new Ye,t=this.geometry.attributes.skinWeight;for(let n=0,s=t.count;n<s;n++){e.fromBufferAttribute(t,n);let r=1/e.manhattanLength();r!==1/0?e.multiplyScalar(r):e.set(1,0,0,0),t.setXYZW(n,e.x,e.y,e.z,e.w)}}updateMatrixWorld(e){super.updateMatrixWorld(e),this.bindMode===ql?this.bindMatrixInverse.copy(this.matrixWorld).invert():this.bindMode===Xh?this.bindMatrixInverse.copy(this.bindMatrix).invert():be("SkinnedMesh: Unrecognized bindMode: "+this.bindMode)}applyBoneTransform(e,t){let n=this.skeleton,s=this.geometry;eh.fromBufferAttribute(s.attributes.skinIndex,e),th.fromBufferAttribute(s.attributes.skinWeight,e),t.isVector4?(or.copy(t),t.set(0,0,0,0)):(or.set(t.x,t.y,t.z,1),t.set(0,0,0)),or.applyMatrix4(this.bindMatrix);for(let r=0;r<4;r++){let a=th.getComponent(r);if(a!==0){let o=eh.getComponent(r);nh.multiplyMatrices(n.bones[o].matrixWorld,n.boneInverses[o]),t.addScaledVector(Xf.copy(or).applyMatrix4(nh),a)}}return t.isVector4&&(t.w=or.w),t.applyMatrix4(this.bindMatrixInverse)}},Ps=class extends ht{constructor(){super(),this.isBone=!0,this.type="Bone"}},Si=class extends Dt{constructor(e=null,t=1,n=1,s,r,a,o,l,c=vt,u=vt,h,d){super(null,a,o,l,c,u,s,r,h,d),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},sh=new Le,Kf=new Le,_r=class i{constructor(e=[],t=[]){this.uuid=Bn(),this.bones=e.slice(0),this.boneInverses=t,this.boneMatrices=null,this.previousBoneMatrices=null,this.boneTexture=null,this.previousBoneTexture=null,this.init()}init(){let e=this.bones,t=this.boneInverses;if(this.boneMatrices=new Float32Array(e.length*16),t.length===0)this.calculateInverses();else if(e.length!==t.length){be("Skeleton: Number of inverse bone matrices does not match amount of bones."),this.boneInverses=[];for(let n=0,s=this.bones.length;n<s;n++)this.boneInverses.push(new Le)}}calculateInverses(){this.boneInverses.length=0;for(let e=0,t=this.bones.length;e<t;e++){let n=new Le;this.bones[e]&&n.copy(this.bones[e].matrixWorld).invert(),this.boneInverses.push(n)}}pose(){for(let e=0,t=this.bones.length;e<t;e++){let n=this.bones[e];n&&n.matrixWorld.copy(this.boneInverses[e]).invert()}for(let e=0,t=this.bones.length;e<t;e++){let n=this.bones[e];n&&(n.parent&&n.parent.isBone?(n.matrix.copy(n.parent.matrixWorld).invert(),n.matrix.multiply(n.matrixWorld)):n.matrix.copy(n.matrixWorld),n.matrix.decompose(n.position,n.quaternion,n.scale))}}update(){let e=this.bones,t=this.boneInverses,n=this.boneMatrices,s=this.boneTexture;for(let r=0,a=e.length;r<a;r++){let o=e[r]?e[r].matrixWorld:Kf;sh.multiplyMatrices(o,t[r]),sh.toArray(n,r*16)}s!==null&&(s.needsUpdate=!0)}clone(){return new i(this.bones,this.boneInverses)}computeBoneTexture(){let e=Math.sqrt(this.bones.length*4);e=Math.ceil(e/4)*4,e=Math.max(e,4);let t=new Float32Array(e*e*4);t.set(this.boneMatrices);let n=new Si(t,e,e,ln,fn);return n.needsUpdate=!0,this.boneMatrices=t,this.boneTexture=n,this}getBoneByName(e){for(let t=0,n=this.bones.length;t<n;t++){let s=this.bones[t];if(s.name===e)return s}}dispose(){this.boneTexture!==null&&(this.boneTexture.dispose(),this.boneTexture=null),this.previousBoneTexture!==null&&(this.previousBoneTexture.dispose(),this.previousBoneTexture=null)}fromJSON(e,t){this.uuid=e.uuid;for(let n=0,s=e.bones.length;n<s;n++){let r=e.bones[n],a=t[r];a===void 0&&(be("Skeleton: No bone found with UUID:",r),a=new Ps),this.bones.push(a),this.boneInverses.push(new Le().fromArray(e.boneInverses[n]))}return this.init(),this}toJSON(){let e={metadata:{version:4.7,type:"Skeleton",generator:"Skeleton.toJSON"},bones:[],boneInverses:[]};e.uuid=this.uuid;let t=this.bones,n=this.boneInverses;for(let s=0,r=t.length;s<r;s++){let a=t[s];e.bones.push(a.uuid);let o=n[s];e.boneInverses.push(o.toArray())}return e}},$n=class extends Bt{constructor(e,t,n,s=1){super(e,t,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=s}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){let e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}},ps=new Le,rh=new Le,Na=[],ah=new Ht,jf=new Le,lr=new je,cr=new nn,Sr=class extends je{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new $n(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let s=0;s<n;s++)this.setMatrixAt(s,jf)}computeBoundingBox(){let e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new Ht),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,ps),ah.copy(e.boundingBox).applyMatrix4(ps),this.boundingBox.union(ah)}computeBoundingSphere(){let e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new nn),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,ps),cr.copy(e.boundingSphere).applyMatrix4(ps),this.boundingSphere.union(cr)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),this.morphTexture=e.morphTexture!==null?e.morphTexture.clone():null,this.instanceColor=e.instanceColor!==null?e.instanceColor.clone():null,this.count=e.count,this.boundingBox=e.boundingBox!==null?e.boundingBox.clone():null,this.boundingSphere=e.boundingSphere!==null?e.boundingSphere.clone():null,this}getColorAt(e,t){return this.instanceColor===null?t.setRGB(1,1,1):t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){return t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){let n=t.morphTargetInfluences,s=this.morphTexture.source.data.data,r=n.length+1,a=e*r+1;for(let o=0;o<n.length;o++)n[o]=s[a+o]}raycast(e,t){let n=this.matrixWorld,s=this.count;if(lr.geometry=this.geometry,lr.material=this.material,lr.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),cr.copy(this.boundingSphere),cr.applyMatrix4(n),e.ray.intersectsSphere(cr)!==!1))for(let r=0;r<s;r++){this.getMatrixAt(r,ps),rh.multiplyMatrices(n,ps),lr.matrixWorld=rh,lr.raycast(e,Na);for(let a=0,o=Na.length;a<o;a++){let l=Na[a];l.instanceId=r,l.object=this,t.push(l)}Na.length=0}}setColorAt(e,t){return this.instanceColor===null&&(this.instanceColor=new $n(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3),this}setMatrixAt(e,t){return t.toArray(this.instanceMatrix.array,e*16),this}setMorphAt(e,t){let n=t.morphTargetInfluences,s=n.length+1;this.morphTexture===null&&(this.morphTexture=new Si(new Float32Array(s*this.count),s,this.count,Hs,fn));let r=this.morphTexture.source.data.data,a=0;for(let c=0;c<n.length;c++)a+=n[c];let o=this.geometry.morphTargetsRelative?1:1-a,l=s*e;return r[l]=o,r.set(n,l+1),this}updateMorphTargets(){}dispose(){super.dispose(),this.instanceMatrix.dispose(),this.instanceColor!==null&&this.instanceColor.dispose(),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}},Ui=new nn,Zf=new Ee(.5,.5),La=new D,Mi=class{constructor(e=new tn,t=new tn,n=new tn,s=new tn,r=new tn,a=new tn){this.planes=[e,t,n,s,r,a]}set(e,t,n,s,r,a){let o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(s),o[4].copy(r),o[5].copy(a),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=Sn,n=!1){let s=this.planes,r=e.elements,a=r[0],o=r[1],l=r[2],c=r[3],u=r[4],h=r[5],d=r[6],f=r[7],g=r[8],_=r[9],m=r[10],p=r[11],y=r[12],w=r[13],M=r[14],b=r[15];if(s[0].setComponents(c-a,f-u,p-g,b-y).normalize(),s[1].setComponents(c+a,f+u,p+g,b+y).normalize(),s[2].setComponents(c+o,f+h,p+_,b+w).normalize(),s[3].setComponents(c-o,f-h,p-_,b-w).normalize(),n)s[4].setComponents(l,d,m,M).normalize(),s[5].setComponents(c-l,f-d,p-m,b-M).normalize();else if(s[4].setComponents(c-l,f-d,p-m,b-M).normalize(),t===Sn)s[5].setComponents(c+l,f+d,p+m,b+M).normalize();else if(t===Ss)s[5].setComponents(l,d,m,M).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),Ui.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),Ui.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Ui)}intersectsSprite(e){Ui.center.set(0,0,0);let t=Zf.distanceTo(e.center);return Ui.radius=.7071067811865476+t,Ui.applyMatrix4(e.matrixWorld),this.intersectsSphere(Ui)}intersectsSphere(e){let t=this.planes,n=e.center,s=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let s=t[n];if(La.x=s.normal.x>0?e.max.x:e.min.x,La.y=s.normal.y>0?e.max.y:e.min.y,La.z=s.normal.z>0?e.max.z:e.min.z,s.distanceToPoint(La)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}},oh=new Le,Ja=class i{constructor(){this.coordinateSystem=Sn,this._frustums=[],this._count=0}setFromArrayCamera(e){let t=e.cameras,n=this._frustums;for(let s=0;s<t.length;s++){let r=t[s];oh.multiplyMatrices(r.projectionMatrix,r.matrixWorldInverse),n[s]===void 0&&(n[s]=new Mi),n[s].setFromProjectionMatrix(oh,r.coordinateSystem,r.reversedDepth)}return this._count=t.length,this}getFrustum(e){return this._frustums[e]}intersectsObject(e){let t=this._frustums;for(let n=0;n<this._count;n++)if(t[n].intersectsObject(e))return!0;return!1}intersectsSprite(e){let t=this._frustums;for(let n=0;n<this._count;n++)if(t[n].intersectsSprite(e))return!0;return!1}intersectsSphere(e){let t=this._frustums;for(let n=0;n<this._count;n++)if(t[n].intersectsSphere(e))return!0;return!1}intersectsBox(e){let t=this._frustums;for(let n=0;n<this._count;n++)if(t[n].intersectsBox(e))return!0;return!1}containsPoint(e){let t=this._frustums;for(let n=0;n<this._count;n++)if(t[n].containsPoint(e))return!0;return!1}copy(e){this.coordinateSystem=e.coordinateSystem;let t=this._frustums,n=e._frustums;for(let s=0;s<e._count;s++)t[s]===void 0&&(t[s]=new Mi),t[s].copy(n[s]);return this._count=e._count,this}clone(){return new i().copy(this)}};var Ns=class extends sn{constructor(e){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new Te(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}},Qa=new D,$a=new D,lh=new Le,ur=new _i,Ua=new nn,Gl=new D,ch=new D,Vi=class extends ht{constructor(e=new gt,t=new Ns){super(),this.isLine=!0,this.type="Line",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0?this.morphTargetInfluences=e.morphTargetInfluences.slice():this.morphTargetInfluences=void 0,e.morphTargetDictionary!==void 0?this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary):this.morphTargetDictionary=void 0,this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[0];for(let s=1,r=t.count;s<r;s++)Qa.fromBufferAttribute(t,s-1),$a.fromBufferAttribute(t,s),n[s]=n[s-1],n[s]+=Qa.distanceTo($a);e.setAttribute("lineDistance",new $e(n,1))}else be("Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let n=this.geometry,s=this.matrixWorld,r=e.params.Line.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Ua.copy(n.boundingSphere),Ua.applyMatrix4(s),Ua.radius+=r,e.ray.intersectsSphere(Ua)===!1)return;lh.copy(s).invert(),ur.copy(e.ray).applyMatrix4(lh);let o=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=this.isLineSegments?2:1,u=n.index,d=n.attributes.position;if(u!==null){let f=Math.max(0,a.start),g=Math.min(u.count,a.start+a.count);for(let _=f,m=g-1;_<m;_+=c){let p=u.getX(_),y=u.getX(_+1),w=Da(this,e,ur,l,p,y,_);w&&t.push(w)}if(this.isLineLoop){let _=u.getX(g-1),m=u.getX(f),p=Da(this,e,ur,l,_,m,g-1);p&&t.push(p)}}else{let f=Math.max(0,a.start),g=Math.min(d.count,a.start+a.count);for(let _=f,m=g-1;_<m;_+=c){let p=Da(this,e,ur,l,_,_+1,_);p&&t.push(p)}if(this.isLineLoop){let _=Da(this,e,ur,l,g-1,f,g-1);_&&t.push(_)}}}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){let o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}};function Da(i,e,t,n,s,r,a){let o=i.geometry.attributes.position;if(Qa.fromBufferAttribute(o,s),$a.fromBufferAttribute(o,r),t.distanceSqToSegment(Qa,$a,Gl,ch)>n)return;Gl.applyMatrix4(i.matrixWorld);let c=e.ray.origin.distanceTo(Gl);if(!(c<e.near||c>e.far))return{distance:c,point:ch.clone().applyMatrix4(i.matrixWorld),index:a,face:null,faceIndex:null,barycoord:null,object:i}}var uh=new D,hh=new D,Mr=class extends Vi{constructor(e,t){super(e,t),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[];for(let s=0,r=t.count;s<r;s+=2)uh.fromBufferAttribute(t,s),hh.fromBufferAttribute(t,s+1),n[s]=s===0?0:n[s-1],n[s+1]=n[s]+uh.distanceTo(hh);e.setAttribute("lineDistance",new $e(n,1))}else be("LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}},br=class extends Vi{constructor(e,t){super(e,t),this.isLineLoop=!0,this.type="LineLoop"}},Ls=class extends sn{constructor(e){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Te(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},dh=new Le,Yl=new _i,Oa=new nn,Fa=new D,Tr=class extends ht{constructor(e=new gt,t=new Ls){super(),this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0?this.morphTargetInfluences=e.morphTargetInfluences.slice():this.morphTargetInfluences=void 0,e.morphTargetDictionary!==void 0?this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary):this.morphTargetDictionary=void 0,this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let n=this.geometry,s=this.matrixWorld,r=e.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Oa.copy(n.boundingSphere),Oa.applyMatrix4(s),Oa.radius+=r,e.ray.intersectsSphere(Oa)===!1)return;dh.copy(s).invert(),Yl.copy(e.ray).applyMatrix4(dh);let o=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=n.index,h=n.attributes.position;if(c!==null){let d=Math.max(0,a.start),f=Math.min(c.count,a.start+a.count);for(let g=d,_=f;g<_;g++){let m=c.getX(g);Fa.fromBufferAttribute(h,m),fh(Fa,m,l,s,e,t,this)}}else{let d=Math.max(0,a.start),f=Math.min(h.count,a.start+a.count);for(let g=d,_=f;g<_;g++)Fa.fromBufferAttribute(h,g),fh(Fa,g,l,s,e,t,this)}}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){let o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}};function fh(i,e,t,n,s,r,a){let o=Yl.distanceSqToPoint(i);if(o<t){let l=new D;Yl.closestPointToPoint(i,l),l.applyMatrix4(n);let c=s.ray.origin.distanceTo(l);if(c<s.near||c>s.far)return;r.push({distance:c,distanceToRay:Math.sqrt(o),point:l,index:e,face:null,faceIndex:null,barycoord:null,object:a})}}var wr=class extends Dt{constructor(e=[],t=ji,n,s,r,a,o,l,c,u){super(e,t,n,s,r,a,o,l,c,u),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}};var ei=class extends Dt{constructor(e,t,n=Cn,s,r,a,o=vt,l=vt,c,u=Jn,h=1){if(u!==Jn&&u!==li)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let d={width:e,height:t,depth:h};super(d,s,r,a,o,l,u,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Ts(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return t.compareFunction=this.compareFunction,t}},Er=class extends ei{constructor(e,t=Cn,n=ji,s,r,a=vt,o=vt,l,c=Jn){let u={width:e,height:e,depth:1},h=[u,u,u,u,u,u];super(e,e,t,n,s,r,a,o,l,c),this.image=h,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}},Ar=class extends Dt{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}},dn=class i extends gt{constructor(e=1,t=1,n=1,s=1,r=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:s,heightSegments:r,depthSegments:a};let o=this;s=Math.floor(s),r=Math.floor(r),a=Math.floor(a);let l=[],c=[],u=[],h=[],d=0,f=0;g("z","y","x",-1,-1,n,t,e,a,r,0),g("z","y","x",1,-1,n,t,-e,a,r,1),g("x","z","y",1,1,e,n,t,s,a,2),g("x","z","y",1,-1,e,n,-t,s,a,3),g("x","y","z",1,-1,e,t,n,s,r,4),g("x","y","z",-1,-1,e,t,-n,s,r,5),this.setIndex(l),this.setAttribute("position",new $e(c,3)),this.setAttribute("normal",new $e(u,3)),this.setAttribute("uv",new $e(h,2));function g(_,m,p,y,w,M,b,E,x,T,N){let C=M/x,P=b/T,F=M/2,G=b/2,A=E/2,U=x+1,B=T+1,V=0,$=0,q=new D;for(let Q=0;Q<B;Q++){let ee=Q*P-G;for(let ve=0;ve<U;ve++){let Ie=ve*C-F;q[_]=Ie*y,q[m]=ee*w,q[p]=A,c.push(q.x,q.y,q.z),q[_]=0,q[m]=0,q[p]=E>0?1:-1,u.push(q.x,q.y,q.z),h.push(ve/x),h.push(1-Q/T),V+=1}}for(let Q=0;Q<T;Q++)for(let ee=0;ee<x;ee++){let ve=d+ee+U*Q,Ie=d+ee+U*(Q+1),j=d+(ee+1)+U*(Q+1),ce=d+(ee+1)+U*Q;l.push(ve,Ie,ce),l.push(Ie,j,ce),$+=6}o.addGroup(f,$,N),f+=$,d+=V}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new i(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}};var Rr=class i extends gt{constructor(e=1,t=32,n=0,s=Math.PI*2){super(),this.type="CircleGeometry",this.parameters={radius:e,segments:t,thetaStart:n,thetaLength:s},t=Math.max(3,t);let r=[],a=[],o=[],l=[],c=new D,u=new Ee;a.push(0,0,0),o.push(0,0,1),l.push(.5,.5);for(let h=0,d=3;h<=t;h++,d+=3){let f=n+h/t*s;c.x=e*Math.cos(f),c.y=e*Math.sin(f),a.push(c.x,c.y,c.z),o.push(0,0,1),u.x=(a[d]/e+1)/2,u.y=(a[d+1]/e+1)/2,l.push(u.x,u.y)}for(let h=1;h<=t;h++)r.push(h,h+1,0);this.setIndex(r),this.setAttribute("position",new $e(a,3)),this.setAttribute("normal",new $e(o,3)),this.setAttribute("uv",new $e(l,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new i(e.radius,e.segments,e.thetaStart,e.thetaLength)}},Jt=class i extends gt{constructor(e=1,t=1,n=1,s=32,r=1,a=!1,o=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:s,heightSegments:r,openEnded:a,thetaStart:o,thetaLength:l};let c=this;s=Math.floor(s),r=Math.floor(r);let u=[],h=[],d=[],f=[],g=0,_=[],m=n/2,p=0;y(),a===!1&&(e>0&&w(!0),t>0&&w(!1)),this.setIndex(u),this.setAttribute("position",new $e(h,3)),this.setAttribute("normal",new $e(d,3)),this.setAttribute("uv",new $e(f,2));function y(){let M=new D,b=new D,E=0,x=(t-e)/n;for(let T=0;T<=r;T++){let N=[],C=T/r,P=C*(t-e)+e;for(let F=0;F<=s;F++){let G=F/s,A=G*l+o,U=Math.sin(A),B=Math.cos(A);b.x=P*U,b.y=-C*n+m,b.z=P*B,h.push(b.x,b.y,b.z),M.set(U,x,B).normalize(),d.push(M.x,M.y,M.z),f.push(G,1-C),N.push(g++)}_.push(N)}for(let T=0;T<s;T++)for(let N=0;N<r;N++){let C=_[N][T],P=_[N+1][T],F=_[N+1][T+1],G=_[N][T+1];(e>0||N!==0)&&(u.push(C,P,G),E+=3),(t>0||N!==r-1)&&(u.push(P,F,G),E+=3)}c.addGroup(p,E,0),p+=E}function w(M){let b=g,E=new Ee,x=new D,T=0,N=M===!0?e:t,C=M===!0?1:-1;for(let F=1;F<=s;F++)h.push(0,m*C,0),d.push(0,C,0),f.push(.5,.5),g++;let P=g;for(let F=0;F<=s;F++){let A=F/s*l+o,U=Math.cos(A),B=Math.sin(A);x.x=N*B,x.y=m*C,x.z=N*U,h.push(x.x,x.y,x.z),d.push(0,C,0),E.x=U*.5+.5,E.y=B*.5*C+.5,f.push(E.x,E.y),g++}for(let F=0;F<s;F++){let G=b+F,A=P+F;M===!0?u.push(A,A+1,G):u.push(A+1,A,G),T+=3}c.addGroup(p,T,M===!0?1:2),p+=T}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new i(e.radiusTop,e.radiusBottom,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}},Cr=class i extends Jt{constructor(e=1,t=1,n=32,s=1,r=!1,a=0,o=Math.PI*2){super(0,e,t,n,s,r,a,o),this.type="ConeGeometry",this.parameters={radius:e,height:t,radialSegments:n,heightSegments:s,openEnded:r,thetaStart:a,thetaLength:o}}static fromJSON(e){return new i(e.radius,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}};var ki=class i extends gt{constructor(e=1,t=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:s};let r=e/2,a=t/2,o=Math.floor(n),l=Math.floor(s),c=o+1,u=l+1,h=e/o,d=t/l,f=[],g=[],_=[],m=[];for(let p=0;p<u;p++){let y=p*d-a;for(let w=0;w<c;w++){let M=w*h-r;g.push(M,-y,0),_.push(0,0,1),m.push(w/o),m.push(1-p/l)}}for(let p=0;p<l;p++)for(let y=0;y<o;y++){let w=y+c*p,M=y+c*(p+1),b=y+1+c*(p+1),E=y+1+c*p;f.push(w,M,E),f.push(M,b,E)}this.setIndex(f),this.setAttribute("position",new $e(g,3)),this.setAttribute("normal",new $e(_,3)),this.setAttribute("uv",new $e(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new i(e.width,e.height,e.widthSegments,e.heightSegments)}};var zi=class i extends gt{constructor(e=1,t=32,n=16,s=0,r=Math.PI*2,a=0,o=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:s,phiLength:r,thetaStart:a,thetaLength:o},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));let l=Math.min(a+o,Math.PI),c=0,u=[],h=new D,d=new D,f=[],g=[],_=[],m=[];for(let p=0;p<=n;p++){let y=[],w=p/n,M=a+w*o,b=e*Math.cos(M),E=Math.sqrt(e*e-b*b),x=0;p===0&&a===0?x=.5/t:p===n&&l===Math.PI&&(x=-.5/t);for(let T=0;T<=t;T++){let N=T/t,C=s+N*r;h.x=-E*Math.cos(C),h.y=b,h.z=E*Math.sin(C),g.push(h.x,h.y,h.z),d.copy(h).normalize(),_.push(d.x,d.y,d.z),m.push(N+x,1-w),y.push(c++)}u.push(y)}for(let p=0;p<n;p++)for(let y=0;y<t;y++){let w=u[p][y+1],M=u[p][y],b=u[p+1][y],E=u[p+1][y+1];(p!==0||a>0)&&f.push(w,M,E),(p!==n-1||l<Math.PI)&&f.push(M,b,E)}this.setIndex(f),this.setAttribute("position",new $e(g,3)),this.setAttribute("normal",new $e(_,3)),this.setAttribute("uv",new $e(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new i(e.radius,e.widthSegments,e.heightSegments,e.phiStart,e.phiLength,e.thetaStart,e.thetaLength)}};function Qi(i){let e={};for(let t in i){e[t]={};for(let n in i[t]){let s=i[t][n];if(ph(s))s.isRenderTargetTexture?(be("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][n]=null):e[t][n]=s.clone();else if(Array.isArray(s))if(ph(s[0])){let r=[];for(let a=0,o=s.length;a<o;a++)r[a]=s[a].clone();e[t][n]=r}else e[t][n]=s.slice();else e[t][n]=s}}return e}function Kt(i){let e={};for(let t=0;t<i.length;t++){let n=Qi(i[t]);for(let s in n)e[s]=n[s]}return e}function ph(i){return i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)}function Yf(i){let e=[];for(let t=0;t<i.length;t++)e.push(i[t].clone());return e}function Ec(i){let e=i.getRenderTarget();return e===null?i.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:Ve.workingColorSpace}var In={clone:Qi,merge:Kt},Jf=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Qf=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,dt=class extends sn{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Jf,this.fragmentShader=Qf,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=Qi(e.uniforms),this.uniformsGroups=Yf(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let s in this.uniforms){let a=this.uniforms[s].value;a&&a.isTexture?t.uniforms[s]={type:"t",value:a.toJSON(e).uuid}:a&&a.isColor?t.uniforms[s]={type:"c",value:a.getHex()}:a&&a.isVector2?t.uniforms[s]={type:"v2",value:a.toArray()}:a&&a.isVector3?t.uniforms[s]={type:"v3",value:a.toArray()}:a&&a.isVector4?t.uniforms[s]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?t.uniforms[s]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?t.uniforms[s]={type:"m4",value:a.toArray()}:t.uniforms[s]={value:a}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let n={};for(let s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}fromJSON(e,t){if(super.fromJSON(e,t),e.uniforms!==void 0)for(let n in e.uniforms){let s=e.uniforms[n];switch(this.uniforms[n]={},s.type){case"t":this.uniforms[n].value=t[s.value]||null;break;case"c":this.uniforms[n].value=new Te().setHex(s.value);break;case"v2":this.uniforms[n].value=new Ee().fromArray(s.value);break;case"v3":this.uniforms[n].value=new D().fromArray(s.value);break;case"v4":this.uniforms[n].value=new Ye().fromArray(s.value);break;case"m3":this.uniforms[n].value=new Ue().fromArray(s.value);break;case"m4":this.uniforms[n].value=new Le().fromArray(s.value);break;default:this.uniforms[n].value=s.value}}if(e.defines!==void 0&&(this.defines=e.defines),e.vertexShader!==void 0&&(this.vertexShader=e.vertexShader),e.fragmentShader!==void 0&&(this.fragmentShader=e.fragmentShader),e.glslVersion!==void 0&&(this.glslVersion=e.glslVersion),e.extensions!==void 0)for(let n in e.extensions)this.extensions[n]=e.extensions[n];return e.lights!==void 0&&(this.lights=e.lights),e.clipping!==void 0&&(this.clipping=e.clipping),this}},Us=class extends dt{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}},qt=class extends sn{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Te(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Te(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Qo,this.normalScale=new Ee(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Qn,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}},Qt=class extends qt{constructor(e){super(),this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new Ee(1,1),this.clearcoatNormalMap=null,this.diffuseRoughnessMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return We(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(t){this.ior=(1+.4*t)/(1-.4*t)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessMinimum=100,this.iridescenceThicknessMaximum=400,this.iridescenceThicknessMap=null,this.sheenColor=new Te(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new Te(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new Te(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._diffuseRoughness=0,this._dispersion=0,this._iridescence=0,this._retroreflectivity=0,this._sheen=0,this._transmission=0,this.setValues(e)}get anisotropy(){return this._anisotropy}set anisotropy(e){this._anisotropy>0!=e>0&&this.version++,this._anisotropy=e}get clearcoat(){return this._clearcoat}set clearcoat(e){this._clearcoat>0!=e>0&&this.version++,this._clearcoat=e}get diffuseRoughness(){return this._diffuseRoughness}set diffuseRoughness(e){this._diffuseRoughness>0!=e>0&&this.version++,this._diffuseRoughness=e}get iridescence(){return this._iridescence}set iridescence(e){this._iridescence>0!=e>0&&this.version++,this._iridescence=e}get dispersion(){return this._dispersion}set dispersion(e){this._dispersion>0!=e>0&&this.version++,this._dispersion=e}get retroreflectivity(){return this._retroreflectivity}set retroreflectivity(e){this._retroreflectivity>0!=e>0&&this.version++,this._retroreflectivity=e}get sheen(){return this._sheen}set sheen(e){this._sheen>0!=e>0&&this.version++,this._sheen=e}get transmission(){return this._transmission}set transmission(e){this._transmission>0!=e>0&&this.version++,this._transmission=e}get iridescenceThicknessRange(){return Di('MeshPhysicalMaterial: The "iridescenceThicknessRange" property has been replaced by "iridescenceThicknessMinimum" and "iridescenceThicknessMaximum".'),[this.iridescenceThicknessMinimum,this.iridescenceThicknessMaximum]}set iridescenceThicknessRange(e){Di('MeshPhysicalMaterial: The "iridescenceThicknessRange" property has been replaced by "iridescenceThicknessMinimum" and "iridescenceThicknessMaximum".'),this.iridescenceThicknessMinimum=e[0],this.iridescenceThicknessMaximum=e[1]}copy(e){return super.copy(e),this.defines={STANDARD:"",PHYSICAL:""},this.anisotropy=e.anisotropy,this.anisotropyRotation=e.anisotropyRotation,this.anisotropyMap=e.anisotropyMap,this.clearcoat=e.clearcoat,this.clearcoatMap=e.clearcoatMap,this.clearcoatRoughness=e.clearcoatRoughness,this.clearcoatRoughnessMap=e.clearcoatRoughnessMap,this.clearcoatNormalMap=e.clearcoatNormalMap,this.clearcoatNormalScale.copy(e.clearcoatNormalScale),this.diffuseRoughness=e.diffuseRoughness,this.diffuseRoughnessMap=e.diffuseRoughnessMap,this.dispersion=e.dispersion,this.ior=e.ior,this.iridescence=e.iridescence,this.iridescenceMap=e.iridescenceMap,this.iridescenceIOR=e.iridescenceIOR,this.iridescenceThicknessMinimum=e.iridescenceThicknessMinimum,this.iridescenceThicknessMaximum=e.iridescenceThicknessMaximum,this.iridescenceThicknessMap=e.iridescenceThicknessMap,this.retroreflectivity=e.retroreflectivity,this.sheen=e.sheen,this.sheenColor.copy(e.sheenColor),this.sheenColorMap=e.sheenColorMap,this.sheenRoughness=e.sheenRoughness,this.sheenRoughnessMap=e.sheenRoughnessMap,this.transmission=e.transmission,this.transmissionMap=e.transmissionMap,this.thickness=e.thickness,this.thicknessMap=e.thicknessMap,this.attenuationDistance=e.attenuationDistance,this.attenuationColor.copy(e.attenuationColor),this.specularIntensity=e.specularIntensity,this.specularIntensityMap=e.specularIntensityMap,this.specularColor.copy(e.specularColor),this.specularColorMap=e.specularColorMap,this}};var eo=class extends sn{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=jh,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},to=class extends sn{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}};function yi(i,e){return!i||i.constructor===e?i:typeof e.BYTES_PER_ELEMENT=="number"?new e(i):Array.prototype.slice.call(i)}function hr(i){return i!==void 0&&i.inTangents!==void 0&&i.outTangents!==void 0}function $f(i){function e(s,r){return i[s]-i[r]}let t=i.length,n=new Array(t);for(let s=0;s!==t;++s)n[s]=s;return n.sort(e),n}function mh(i,e,t){let n=i.length,s=new i.constructor(n);for(let r=0,a=0;a!==n;++r){let o=t[r]*e;for(let l=0;l!==e;++l)s[a++]=i[o+l]}return s}function ep(i,e,t,n){let s=1,r=i[0];for(;r!==void 0&&r[n]===void 0;)r=i[s++];if(r===void 0)return;let a=r[n];if(a!==void 0)if(Array.isArray(a))do a=r[n],a!==void 0&&(e.push(r.time),t.push(...a)),r=i[s++];while(r!==void 0);else if(a.toArray!==void 0)do a=r[n],a!==void 0&&(e.push(r.time),a.toArray(t,t.length)),r=i[s++];while(r!==void 0);else do a=r[n],a!==void 0&&(e.push(r.time),t.push(a)),r=i[s++];while(r!==void 0)}var Dn=class{constructor(e,t,n,s){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=s!==void 0?s:new t.constructor(n),this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,s=t[n],r=t[n-1];n:{e:{let a;t:{i:if(!(e<s)){for(let o=n+2;;){if(s===void 0){if(e<r)break i;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===o)break;if(r=s,s=t[++n],e<s)break e}a=t.length;break t}if(!(e>=r)){let o=t[1];e<o&&(n=2,r=o);for(let l=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(s=r,r=t[--n-1],e>=r)break e}a=n,n=0;break t}break n}for(;n<a;){let o=n+a>>>1;e<t[o]?a=o:n=o+1}if(s=t[n],r=t[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(s===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,s)}return this.interpolate_(n,r,e,s)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,s=this.valueSize,r=e*s;for(let a=0;a!==s;++a)t[a]=n[r+a];return t}interpolate_(){throw new Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}},no=class extends Dn{constructor(e,t,n,s){super(e,t,n,s),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:Kl,endingEnd:Kl}}intervalChanged_(e,t,n){let s=this.parameterPositions,r=e-2,a=e+1,o=s[r],l=s[a];if(o===void 0)switch(this.getSettings_().endingStart){case jl:r=e,o=2*t-n;break;case Zl:r=s.length-2,o=t+s[r]-s[r+1];break;default:r=e,o=n}if(l===void 0)switch(this.getSettings_().endingEnd){case jl:a=e,l=2*n-t;break;case Zl:a=1,l=n+s[1]-s[0];break;default:a=e-1,l=t}let c=(n-t)*.5,u=this.valueSize;this._weightPrev=c/(t-o),this._weightNext=c/(l-n),this._offsetPrev=r*u,this._offsetNext=a*u}interpolate_(e,t,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=e*o,c=l-o,u=this._offsetPrev,h=this._offsetNext,d=this._weightPrev,f=this._weightNext,g=(n-t)/(s-t),_=g*g,m=_*g,p=-d*m+2*d*_-d*g,y=(1+d)*m+(-1.5-2*d)*_+(-.5+d)*g+1,w=(-1-f)*m+(1.5+f)*_+.5*g,M=f*m-f*_;for(let b=0;b!==o;++b)r[b]=p*a[u+b]+y*a[c+b]+w*a[l+b]+M*a[h+b];return r}},io=class extends Dn{constructor(e,t,n,s){super(e,t,n,s)}interpolate_(e,t,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=e*o,c=l-o,u=(n-t)/(s-t),h=1-u;for(let d=0;d!==o;++d)r[d]=a[c+d]*h+a[l+d]*u;return r}},so=class extends Dn{constructor(e,t,n,s){super(e,t,n,s)}interpolate_(e){return this.copySampleValue_(e-1)}},ro=class extends Dn{interpolate_(e,t,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=e*o,c=l-o,u=this.inTangents,h=this.outTangents;if(!u||!h){let g=(n-t)/(s-t),_=1-g;for(let m=0;m!==o;++m)r[m]=a[c+m]*_+a[l+m]*g;return r}let d=o*2,f=e-1;for(let g=0;g!==o;++g){let _=a[c+g],m=a[l+g],p=f*d+g*2,y=h[p],w=h[p+1],M=e*d+g*2,b=u[M],E=u[M+1],x=np(n,t,y,b,s);r[g]=od(x,_,w,E,m)}return r}};function od(i,e,t,n,s){let r=1-i;return r*r*r*e+3*r*r*i*t+3*r*i*i*n+i*i*i*s}function tp(i,e,t,n,s){let r=1-i;return 3*r*r*(t-e)+6*r*i*(n-t)+3*i*i*(s-n)}function np(i,e,t,n,s){let r=(i-e)/(s-e);for(let a=0;a<8;a++){let o=od(r,e,t,n,s)-i;if(Math.abs(o)<1e-10)break;let l=tp(r,e,t,n,s);if(Math.abs(l)<1e-10)break;r=Math.max(0,Math.min(1,r-o/l))}return r}var rn=class{constructor(e,t,n,s){if(e===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=yi(t,this.TimeBufferType),this.values=yi(n,this.ValueBufferType),this.setInterpolation(s||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:yi(e.times,Array),values:yi(e.values,Array)};let s=e.getInterpolation();s!==e.DefaultInterpolation&&(n.interpolation=s),hr(e.settings)&&(n.settings={inTangents:yi(e.settings.inTangents,Array),outTangents:yi(e.settings.outTangents,Array)})}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new so(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new io(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new no(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodBezier(e){let t=new ro(this.times,this.values,this.getValueSize(),e);return this.settings&&(t.inTangents=this.settings.inTangents,t.outTangents=this.settings.outTangents),t}setInterpolation(e){let t;switch(e){case Oi:t=this.InterpolantFactoryMethodDiscrete;break;case Fi:t=this.InterpolantFactoryMethodLinear;break;case ka:t=this.InterpolantFactoryMethodSmooth;break;case Xl:t=this.InterpolantFactoryMethodBezier;break}if(t===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return be("KeyframeTrack:",n),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return Oi;case this.InterpolantFactoryMethodLinear:return Fi;case this.InterpolantFactoryMethodSmooth:return ka;case this.InterpolantFactoryMethodBezier:return Xl}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,s=t.length;n!==s;++n)t[n]+=e;hr(this.settings)&&(gh(this.settings.inTangents,e),gh(this.settings.outTangents,e))}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,s=t.length;n!==s;++n)t[n]*=e;hr(this.settings)&&(xh(this.settings.inTangents,e),xh(this.settings.outTangents,e))}return this}trim(e,t){let n=this.times,s=n.length,r=0,a=s-1;for(;r!==s&&n[r]<e;)++r;for(;a!==-1&&n[a]>t;)--a;if(++a,r!==0||a!==s){r>=a&&(a=Math.max(a,1),r=a-1);let o=this.getValueSize();this.times=n.slice(r,a),this.values=this.values.slice(r*o,a*o)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(Ne("KeyframeTrack: Invalid value size in track.",this),e=!1);let n=this.times,s=this.values,r=n.length;r===0&&(Ne("KeyframeTrack: Track is empty.",this),e=!1);let a=null;for(let o=0;o!==r;o++){let l=n[o];if(typeof l=="number"&&isNaN(l)){Ne("KeyframeTrack: Time is not a valid number.",this,o,l),e=!1;break}if(a!==null&&a>l){Ne("KeyframeTrack: Out of order keys.",this,o,l,a),e=!1;break}a=l}if(s!==void 0&&ff(s))for(let o=0,l=s.length;o!==l;++o){let c=s[o];if(isNaN(c)){Ne("KeyframeTrack: Value is not a valid number.",this,o,c),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),s=this.getInterpolation()===ka,r=e.length-1,a=1;for(let o=1;o<r;++o){let l=!1,c=e[o],u=e[o+1];if(c!==u&&(o!==1||c!==e[0]))if(s)l=!0;else{let h=o*n,d=h-n,f=h+n;for(let g=0;g!==n;++g){let _=t[h+g];if(_!==t[d+g]||_!==t[f+g]){l=!0;break}}}if(l){if(o!==a){e[a]=e[o];let h=o*n,d=a*n;for(let f=0;f!==n;++f)t[d+f]=t[h+f]}++a}}if(r>0){e[a]=e[r];for(let o=r*n,l=a*n,c=0;c!==n;++c)t[l+c]=t[o+c];++a}return a!==e.length?(this.times=e.slice(0,a),this.values=t.slice(0,a*n)):(this.times=e,this.values=t),this}clone(){let e=this.times.slice(),t=this.values.slice(),n=this.constructor,s=new n(this.name,e,t);return s.createInterpolant=this.createInterpolant,hr(this.settings)&&(s.settings={inTangents:this.settings.inTangents.slice(),outTangents:this.settings.outTangents.slice()}),s}};function gh(i,e){for(let t=0,n=i.length;t!==n;t+=2)i[t]+=e}function xh(i,e){for(let t=0,n=i.length;t!==n;t+=2)i[t]*=e}rn.prototype.ValueTypeName="";rn.prototype.TimeBufferType=Float32Array;rn.prototype.ValueBufferType=Float32Array;rn.prototype.DefaultInterpolation=Fi;var ti=class extends rn{constructor(e,t,n){super(e,t,n)}};ti.prototype.ValueTypeName="bool";ti.prototype.ValueBufferType=Array;ti.prototype.DefaultInterpolation=Oi;ti.prototype.InterpolantFactoryMethodLinear=void 0;ti.prototype.InterpolantFactoryMethodSmooth=void 0;var Ir=class extends rn{constructor(e,t,n,s){super(e,t,n,s)}};Ir.prototype.ValueTypeName="color";var ni=class extends rn{constructor(e,t,n,s){super(e,t,n,s)}};ni.prototype.ValueTypeName="number";var ao=class extends Dn{constructor(e,t,n,s){super(e,t,n,s)}interpolate_(e,t,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=(n-t)/(s-t),c=e*o;for(let u=c+o;c!==u;c+=4)hn.slerpFlat(r,0,a,c-o,a,c,l);return r}},ii=class extends rn{constructor(e,t,n,s){super(e,t,n,s)}InterpolantFactoryMethodLinear(e){return new ao(this.times,this.values,this.getValueSize(),e)}};ii.prototype.ValueTypeName="quaternion";ii.prototype.InterpolantFactoryMethodSmooth=void 0;var si=class extends rn{constructor(e,t,n){super(e,t,n)}};si.prototype.ValueTypeName="string";si.prototype.ValueBufferType=Array;si.prototype.DefaultInterpolation=Oi;si.prototype.InterpolantFactoryMethodLinear=void 0;si.prototype.InterpolantFactoryMethodSmooth=void 0;var bi=class extends rn{constructor(e,t,n,s){super(e,t,n,s)}};bi.prototype.ValueTypeName="vector";var Pr=class{constructor(e="",t=-1,n=[],s=Kh){this.name=e,this.tracks=n,this.duration=t,this.blendMode=s,this.uuid=Bn(),this.userData={},this.duration<0&&this.resetDuration()}static parse(e){let t=[],n=e.tracks,s=1/(e.fps||1);for(let a=0,o=n.length;a!==o;++a)t.push(sp(n[a]).scale(s));let r=new this(e.name,e.duration,t,e.blendMode);return r.uuid=e.uuid,r.userData=JSON.parse(e.userData||"{}"),r}static toJSON(e){let t=[],n=e.tracks,s={name:e.name,duration:e.duration,tracks:t,uuid:e.uuid,blendMode:e.blendMode,userData:JSON.stringify(e.userData)};for(let r=0,a=n.length;r!==a;++r)t.push(rn.toJSON(n[r]));return s}static CreateFromMorphTargetSequence(e,t,n,s){let r=t.length,a=[];for(let o=0;o<r;o++){let l=[],c=[];l.push((o+r-1)%r,o,(o+1)%r),c.push(0,1,0);let u=$f(l);l=mh(l,1,u),c=mh(c,1,u),!s&&l[0]===0&&(l.push(r),c.push(c[0])),a.push(new ni(".morphTargetInfluences["+t[o].name+"]",l,c).scale(1/n))}return new this(e,-1,a)}static findByName(e,t){let n=e;if(!Array.isArray(e)){let s=e;n=s.geometry&&s.geometry.animations||s.animations}for(let s=0;s<n.length;s++)if(n[s].name===t)return n[s];return null}static CreateClipsFromMorphTargetSequences(e,t,n){let s={},r=/^([\w-]*?)([\d]+)$/;for(let o=0,l=e.length;o<l;o++){let c=e[o],u=c.name.match(r);if(u&&u.length>1){let h=u[1],d=s[h];d||(s[h]=d=[]),d.push(c)}}let a=[];for(let o in s)a.push(this.CreateFromMorphTargetSequence(o,s[o],t,n));return a}resetDuration(){let e=this.tracks,t=0;for(let n=0,s=e.length;n!==s;++n){let r=this.tracks[n];t=Math.max(t,r.times[r.times.length-1])}return this.duration=t,this}trim(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].trim(0,this.duration);return this}validate(){let e=!0;for(let t=0;t<this.tracks.length;t++)e=e&&this.tracks[t].validate();return e}optimize(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].optimize();return this}clone(){let e=[];for(let n=0;n<this.tracks.length;n++)e.push(this.tracks[n].clone());let t=new this.constructor(this.name,this.duration,e,this.blendMode);return t.userData=JSON.parse(JSON.stringify(this.userData)),t}toJSON(){return this.constructor.toJSON(this)}};function ip(i){switch(i.toLowerCase()){case"scalar":case"double":case"float":case"number":case"integer":return ni;case"vector":case"vector2":case"vector3":case"vector4":return bi;case"color":return Ir;case"quaternion":return ii;case"bool":case"boolean":return ti;case"string":return si}throw new Error("THREE.KeyframeTrack: Unsupported typeName: "+i)}function sp(i){if(i.type===void 0)throw new Error("THREE.KeyframeTrack: track type undefined, can not parse");let e=ip(i.type);if(i.times===void 0){let n=[],s=[];ep(i.keys,n,s,"value"),i.times=n,i.values=s}let t;return e.parse!==void 0?t=e.parse(i):t=new e(i.name,i.times,i.values,i.interpolation),hr(i.settings)&&(t.settings={inTangents:yi(i.settings.inTangents,Float32Array),outTangents:yi(i.settings.outTangents,Float32Array)}),t}var Ln={enabled:!1,files:{},add:function(i,e){this.enabled!==!1&&(yh(i)||(this.files[i]=e))},get:function(i){if(this.enabled!==!1&&!yh(i))return this.files[i]},remove:function(i){delete this.files[i]},clear:function(){this.files={}}};function yh(i){try{let e=i.slice(i.indexOf(":")+1);return new URL(e).protocol==="blob:"}catch{return!1}}var oo=class{constructor(e,t,n){let s=this,r=!1,a=0,o=0,l,c=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this._abortController=null,this.itemStart=function(u){o++,r===!1&&s.onStart!==void 0&&s.onStart(u,a,o),r=!0},this.itemEnd=function(u){a++,s.onProgress!==void 0&&s.onProgress(u,a,o),a===o&&(r=!1,s.onLoad!==void 0&&s.onLoad())},this.itemError=function(u){s.onError!==void 0&&s.onError(u)},this.resolveURL=function(u){return u=u.normalize("NFC"),l?l(u):u},this.setURLModifier=function(u){return l=u,this},this.addHandler=function(u,h){return c.push(u,h),this},this.removeHandler=function(u){let h=c.indexOf(u);return h!==-1&&c.splice(h,2),this},this.getHandler=function(u){for(let h=0,d=c.length;h<d;h+=2){let f=c[h],g=c[h+1];if(f.global&&(f.lastIndex=0),f.test(u))return g}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}},ld=new oo,On=class{constructor(e){this.manager=e!==void 0?e:ld,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},this.priority="auto",this.cache="default",typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(e,t){let n=this;return new Promise(function(s,r){n.load(e,s,t,r)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}setPriority(e){return this.priority=e,this}setCache(e){return this.cache=e,this}abort(){return this}};On.DEFAULT_MATERIAL_NAME="__DEFAULT";var Zn={},Jl=class extends Error{constructor(e,t){super(e),this.response=t}},Ds=class extends On{constructor(e){super(e),this.mimeType="",this.responseType="",this._abortController=new AbortController}load(e,t,n,s){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let r=Ln.get(`file:${e}`);if(r!==void 0){this.manager.itemStart(e),setTimeout(()=>{t&&t(r),this.manager.itemEnd(e)},0);return}if(Zn[e]!==void 0){Zn[e].push({onLoad:t,onProgress:n,onError:s});return}Zn[e]=[],Zn[e].push({onLoad:t,onProgress:n,onError:s});let a=new Request(e,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?"include":"same-origin",priority:this.priority,cache:this.cache,signal:typeof AbortSignal.any=="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal}),o=this.mimeType,l=this.responseType;fetch(a).then(c=>{if(c.status===200||c.status===0){if(c.status===0&&be("FileLoader: HTTP Status 0 received."),typeof ReadableStream>"u"||c.body===void 0||c.body.getReader===void 0)return c;let u=Zn[e],h=c.body.getReader(),d=c.headers.get("X-File-Size")||c.headers.get("Content-Length"),f=d?parseInt(d):0,g=f!==0,_=0,m=new ReadableStream({start(p){y();function y(){h.read().then(({done:w,value:M})=>{if(w)p.close();else{_+=M.byteLength;let b=new ProgressEvent("progress",{lengthComputable:g,loaded:_,total:f});for(let E=0,x=u.length;E<x;E++){let T=u[E];T.onProgress&&T.onProgress(b)}p.enqueue(M),y()}},w=>{p.error(w)})}}});return new Response(m)}else throw new Jl(`fetch for "${c.url}" responded with ${c.status}: ${c.statusText}`,c)}).then(c=>{switch(l){case"arraybuffer":return c.arrayBuffer();case"blob":return c.blob();case"document":return c.text().then(u=>new DOMParser().parseFromString(u,o));case"json":return c.json();default:if(o==="")return c.text();{let h=/charset="?([^;"\s]*)"?/i.exec(o),d=h&&h[1]?h[1].toLowerCase():void 0,f=new TextDecoder(d);return c.arrayBuffer().then(g=>f.decode(g))}}}).then(c=>{Ln.add(`file:${e}`,c);let u=Zn[e];delete Zn[e];for(let h=0,d=u.length;h<d;h++){let f=u[h];f.onLoad&&f.onLoad(c)}}).catch(c=>{let u=Zn[e];if(u===void 0)throw this.manager.itemError(e),c;delete Zn[e];for(let h=0,d=u.length;h<d;h++){let f=u[h];f.onError&&f.onError(c)}this.manager.itemError(e)}).finally(()=>{this.manager.itemEnd(e)}),this.manager.itemStart(e)}setResponseType(e){return this.responseType=e,this}setMimeType(e){return this.mimeType=e,this}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}};var ms=new WeakMap,lo=class extends On{constructor(e){super(e)}load(e,t,n,s){this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let r=this,a=Ln.get(`image:${e}`);if(a!==void 0){if(a.complete===!0)r.manager.itemStart(e),setTimeout(function(){t&&t(a),r.manager.itemEnd(e)},0);else{let h=ms.get(a);h===void 0&&(h=[],ms.set(a,h)),h.push({onLoad:t,onError:s})}return a}let o=Ms("img");function l(){u(),t&&t(this);let h=ms.get(this)||[];for(let d=0;d<h.length;d++){let f=h[d];f.onLoad&&f.onLoad(this)}ms.delete(this),r.manager.itemEnd(e)}function c(h){u(),s&&s(h),Ln.remove(`image:${e}`);let d=ms.get(this)||[];for(let f=0;f<d.length;f++){let g=d[f];g.onError&&g.onError(h)}ms.delete(this),r.manager.itemError(e),r.manager.itemEnd(e)}function u(){o.removeEventListener("load",l,!1),o.removeEventListener("error",c,!1)}return o.addEventListener("load",l,!1),o.addEventListener("error",c,!1),e.slice(0,5)!=="data:"&&this.crossOrigin!==void 0&&(o.crossOrigin=this.crossOrigin),Ln.add(`image:${e}`,o),r.manager.itemStart(e),o.fetchPriority=this.priority,o.src=e,o}};var Gi=class extends On{constructor(e){super(e)}load(e,t,n,s){let r=new Dt,a=new lo(this.manager);return a.setPriority(this.priority),a.setCache(this.cache),a.setCrossOrigin(this.crossOrigin),a.setPath(this.path),a.load(e,function(o){r.image=o,r.needsUpdate=!0,t!==void 0&&t(r)},n,s),r}},Os=class extends ht{static registerNode(e){this.prototype._lightNode=e}constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new Te(e),this.intensity=t}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){let t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}};var Hl=new Le,vh=new D,_h=new D,Fs=class{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Ee(512,512),this.mapType=on,this.map=null,this.mapPass=null,this.matrix=new Le,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Mi,this._frameExtents=new Ee(1,1),this._viewportCount=1,this._viewports=[new Ye(0,0,1,1)]}getViewportCount(){return this._viewportCount}getCamera(){return this.camera}getFrustum(){return this._frustum}updateMatrices(e){let t=this.camera;vh.setFromMatrixPosition(e.matrixWorld),t.position.copy(vh),_h.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(_h),t.updateMatrixWorld(),this._updateMatrix(t,this.matrix,this._frustum)}_updateMatrix(e,t,n,s){Hl.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),n.setFromProjectionMatrix(Hl,e.coordinateSystem,e.reversedDepth);let r=this._frameExtents,a=s?s.z/r.x:1,o=s?s.w/r.y:1,l=s?s.x/r.x:0,c=s?s.y/r.y:0;e.coordinateSystem===Ss||e.reversedDepth?t.set(.5*a,0,0,.5*a+l,0,.5*o,0,.5*o+c,0,0,1,0,0,0,0,1):t.set(.5*a,0,0,.5*a+l,0,.5*o,0,.5*o+c,0,0,.5,.5,0,0,0,1),t.multiply(Hl)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.mapType=e.mapType,this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let e={};return e.intensity=this.intensity,e.bias=this.bias,e.normalBias=this.normalBias,e.radius=this.radius,e.blurSamples=this.blurSamples,e.mapSize=this.mapSize.toArray(),e.mapType=this.mapType,e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}},Ba=new D,Va=new hn,Nn=new D,Nr=class extends ht{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Le,this.projectionMatrix=new Le,this.projectionMatrixInverse=new Le,this.coordinateSystem=Sn,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(Ba,Va,Nn),Nn.x===1&&Nn.y===1&&Nn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Ba,Va,Nn.set(1,1,1)).invert()}updateWorldMatrix(e,t,n=!1){super.updateWorldMatrix(e,t,n),this.matrixWorld.decompose(Ba,Va,Nn),Nn.x===1&&Nn.y===1&&Nn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Ba,Va,Nn.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},xi=new D,Sh=new Ee,Mh=new Ee,Tt=class extends Nr{constructor(e=50,t=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=Bi*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(dr*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return Bi*2*Math.atan(Math.tan(dr*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){xi.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(xi.x,xi.y).multiplyScalar(-e/xi.z),xi.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(xi.x,xi.y).multiplyScalar(-e/xi.z)}getViewSize(e,t){return this.getViewBounds(e,Sh,Mh),t.subVectors(Mh,Sh)}setViewOffset(e,t,n,s,r,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(dr*.5*this.fov)/this.zoom,n=2*t,s=this.aspect*n,r=-.5*s,a=this.view;if(this.view!==null&&this.view.enabled){let l=a.fullWidth,c=a.fullHeight;r+=a.offsetX*s/l,t-=a.offsetY*n/c,s*=a.width/l,n*=a.height/c}let o=this.filmOffset;o!==0&&(r+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}},Ql=class extends Fs{constructor(){super(new Tt(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1,this.aspect=1}updateMatrices(e){let t=this.camera,n=Bi*2*e.angle*this.focus,s=this.mapSize.width/this.mapSize.height*this.aspect,r=e.distance||t.far;(n!==t.fov||s!==t.aspect||r!==t.far)&&(t.fov=n,t.aspect=s,t.far=r,t.updateProjectionMatrix()),super.updateMatrices(e)}copy(e){return super.copy(e),this.focus=e.focus,this.aspect=e.aspect,this}toJSON(){let e=super.toJSON();return e.focus=this.focus,e.aspect=this.aspect,e}},Lr=class extends Os{constructor(e,t,n=0,s=Math.PI/3,r=0,a=2){super(e,t),this.isSpotLight=!0,this.type="SpotLight",this.position.copy(ht.DEFAULT_UP),this.updateMatrix(),this.target=new ht,this.distance=n,this.angle=s,this.penumbra=r,this.decay=a,this.map=null,this.shadow=new Ql}get power(){return this.intensity*Math.PI}set power(e){this.intensity=e/Math.PI}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.angle=e.angle,this.penumbra=e.penumbra,this.decay=e.decay,this.target=e.target.clone(),this.map=e.map,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.distance=this.distance,t.object.angle=this.angle,t.object.decay=this.decay,t.object.penumbra=this.penumbra,t.object.target=this.target.uuid,this.map&&this.map.isTexture&&(t.object.map=this.map.toJSON(e).uuid),t.object.shadow=this.shadow.toJSON(),t}},$l=class extends Fs{constructor(){super(new Tt(90,1,.5,500)),this.isPointLightShadow=!0}},Ur=class extends Os{constructor(e,t,n=0,s=2){super(e,t),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=s,this.shadow=new $l}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.distance=this.distance,t.object.decay=this.decay,t.object.shadow=this.shadow.toJSON(),t}},ri=class extends Nr{constructor(e=-1,t=1,n=1,s=-1,r=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=s,this.near=r,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,s,r,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2,r=n-e,a=n+e,o=s+t,l=s-t;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,u=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,a=r+c*this.view.width,o-=u*this.view.offsetY,l=o-u*this.view.height}this.projectionMatrix.makeOrthographic(r,a,o,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}},ec=class extends Fs{constructor(){super(new ri(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},Hi=class extends Os{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(ht.DEFAULT_UP),this.updateMatrix(),this.target=new ht,this.shadow=new ec}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}};var ai=class{static extractUrlBase(e){let t=e.lastIndexOf("/");return t===-1?"./":e.slice(0,t+1)}static resolveURL(e,t){return typeof e!="string"||e===""?"":(/^https?:\/\//i.test(t)&&/^\//.test(e)&&(t=t.replace(/(^https?:\/\/[^\/]+).*/i,"$1")),/^(https?:)?\/\//i.test(e)||/^data:.*,.*$/i.test(e)||/^blob:.*$/i.test(e)?e:t+e)}};var Wl=new WeakMap,Dr=class extends On{constructor(e){super(e),this.isImageBitmapLoader=!0,typeof createImageBitmap>"u"&&be("ImageBitmapLoader: createImageBitmap() not supported."),typeof fetch>"u"&&be("ImageBitmapLoader: fetch() not supported."),this.options={premultiplyAlpha:"none"},this._abortController=new AbortController}setOptions(e){return this.options=e,this}load(e,t,n,s){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let r=this,a=Ln.get(`image-bitmap:${e}`);if(a!==void 0){if(r.manager.itemStart(e),a.then){a.then(c=>{Wl.has(a)===!0?(s&&s(Wl.get(a)),r.manager.itemError(e),r.manager.itemEnd(e)):(t&&t(c),r.manager.itemEnd(e))});return}setTimeout(function(){t&&t(a),r.manager.itemEnd(e)},0);return}let o={};o.credentials=this.withCredentials||this.crossOrigin!=="anonymous"?"include":"same-origin",o.headers=this.requestHeader,o.priority=this.priority,o.cache=this.cache,o.signal=typeof AbortSignal.any=="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal;let l=fetch(e,o).then(function(c){return c.blob()}).then(function(c){return createImageBitmap(c,Object.assign({},r.options,{colorSpaceConversion:"none"}))}).then(function(c){return Ln.add(`image-bitmap:${e}`,c),t&&t(c),r.manager.itemEnd(e),c}).catch(function(c){s&&s(c),Wl.set(l,c),Ln.remove(`image-bitmap:${e}`),r.manager.itemError(e),r.manager.itemEnd(e)});Ln.add(`image-bitmap:${e}`,l),r.manager.itemStart(e)}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}};var gs=-90,xs=1,Ti=class extends ht{constructor(e,t,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let s=new Tt(gs,xs,e,t);s.layers=this.layers,this.add(s);let r=new Tt(gs,xs,e,t);r.layers=this.layers,this.add(r);let a=new Tt(gs,xs,e,t);a.layers=this.layers,this.add(a);let o=new Tt(gs,xs,e,t);o.layers=this.layers,this.add(o);let l=new Tt(gs,xs,e,t);l.layers=this.layers,this.add(l);let c=new Tt(gs,xs,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[n,s,r,a,o,l]=t;for(let c of t)this.remove(c);if(e===Sn)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(e===Ss)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(let c of t)this.add(c),c.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:s}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[r,a,o,l,c,u]=this.children,h=e.getRenderTarget(),d=e.getActiveCubeFace(),f=e.getActiveMipmapLevel(),g=e.xr.enabled;e.xr.enabled=!1;let _=n.texture.mipmapsAutoUpdate;n.texture.mipmapsAutoUpdate=!1;let m=!1;e.isWebGLRenderer===!0?m=e.state.buffers.depth.getReversed():m=e.reversedDepthBuffer,e.setRenderTarget(n,0,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,r),e.setRenderTarget(n,1,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(n,2,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(n,3,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),e.setRenderTarget(n,4,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),n.texture.mipmapsAutoUpdate=_,e.setRenderTarget(n,5,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,u),e.setRenderTarget(h,d,f),e.xr.enabled=g,n.texture.needsPMREMUpdate=!0}},co=class extends Tt{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e,this.perCameraFrustumCulled=!1}},Or=class{constructor(){this._previousTime=0,this._currentTime=0,this._startTime=performance.now(),this._delta=0,this._elapsed=0,this._timescale=1,this._document=null,this._pageVisibilityHandler=null}connect(e){this._document=e,e.hidden!==void 0&&(this._pageVisibilityHandler=rp.bind(this),e.addEventListener("visibilitychange",this._pageVisibilityHandler,!1))}disconnect(){this._pageVisibilityHandler!==null&&(this._document.removeEventListener("visibilitychange",this._pageVisibilityHandler),this._pageVisibilityHandler=null),this._document=null}getDelta(){return this._delta/1e3}getElapsed(){return this._elapsed/1e3}getTimescale(){return this._timescale}setTimescale(e){return this._timescale=e,this}reset(){return this._currentTime=performance.now()-this._startTime,this}dispose(){this.disconnect()}update(e){return this._pageVisibilityHandler!==null&&this._document.hidden===!0?this._delta=0:(this._previousTime=this._currentTime,this._currentTime=(e!==void 0?e:performance.now())-this._startTime,this._delta=(this._currentTime-this._previousTime)*this._timescale,this._elapsed+=this._delta),this}};function rp(){this._document.hidden===!1&&this.reset()}var Ac="\\[\\]\\.:\\/",ap=new RegExp("["+Ac+"]","g"),Rc="[^"+Ac+"]",op="[^"+Ac.replace("\\.","")+"]",lp=/((?:WC+[\/:])*)/.source.replace("WC",Rc),cp=/(WCOD+)?/.source.replace("WCOD",op),up=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Rc),hp=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Rc),dp=new RegExp("^"+lp+cp+up+hp+"$"),fp=["material","materials","bones","map"],tc=class{constructor(e,t,n){let s=n||st.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,s)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,s=this._bindings[n];s!==void 0&&s.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let s=this._targetGroup.nCachedObjects_,r=n.length;s!==r;++s)n[s].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}},st=class i{constructor(e,t,n){this.path=t,this.parsedPath=n||i.parseTrackName(t),this.node=i.findNode(e,this.parsedPath.nodeName),this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,n){return e&&e.isAnimationObjectGroup?new i.Composite(e,t,n):new i(e,t,n)}static sanitizeNodeName(e){return e.replace(/\s/g,"_").replace(ap,"")}static parseTrackName(e){let t=dp.exec(e);if(t===null)throw new Error("THREE.PropertyBinding: Cannot parse trackName: "+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},s=n.nodeName&&n.nodeName.lastIndexOf(".");if(s!==void 0&&s!==-1){let r=n.nodeName.substring(s+1);fp.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,s),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+e);return n}static findNode(e,t){if(t===void 0||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(r){for(let a=0;a<r.length;a++){let o=r[a];if(o.name===t||o.uuid===t)return o;let l=n(o.children);if(l)return l}return null},s=n(e.children);if(s)return s}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)e[t++]=n[s]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node,t=this.parsedPath,n=t.objectName,s=t.propertyName,r=t.propertyIndex;if(e||(e=i.findNode(this.rootNode,t.nodeName),this.node=e),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e){be("PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=t.objectIndex;switch(n){case"materials":if(!e.material){Ne("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.materials){Ne("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}e=e.material.materials;break;case"bones":if(!e.skeleton){Ne("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}e=e.skeleton.bones;for(let u=0;u<e.length;u++)if(e[u].name===c){c=u;break}break;case"map":if("map"in e){e=e.map;break}if(!e.material){Ne("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.map){Ne("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}e=e.material.map;break;default:if(e[n]===void 0){Ne("PropertyBinding: Can not bind to objectName of node undefined.",this);return}e=e[n]}if(c!==void 0){if(e[c]===void 0){Ne("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,e);return}e=e[c]}}let a=e[s];if(a===void 0){let c=t.nodeName;Ne("PropertyBinding: Trying to update property for track: "+c+"."+s+" but it wasn't found.",e);return}let o=this.Versioning.None;this.targetObject=e,e.isMaterial===!0?o=this.Versioning.NeedsUpdate:e.isObject3D===!0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(r!==void 0){if(s==="morphTargetInfluences"){if(!e.geometry){Ne("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!e.geometry.morphAttributes){Ne("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}e.morphTargetDictionary[r]!==void 0&&(r=e.morphTargetDictionary[r])}l=this.BindingType.ArrayElement,this.resolvedProperty=a,this.propertyIndex=r}else a.fromArray!==void 0&&a.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=a):Array.isArray(a)?(l=this.BindingType.EntireArray,this.resolvedProperty=a):this.propertyName=s;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};st.Composite=tc;st.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};st.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};st.prototype.GetterByBindingType=[st.prototype._getValue_direct,st.prototype._getValue_array,st.prototype._getValue_arrayElement,st.prototype._getValue_toArray];st.prototype.SetterByBindingTypeAndVersioning=[[st.prototype._setValue_direct,st.prototype._setValue_direct_setNeedsUpdate,st.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[st.prototype._setValue_array,st.prototype._setValue_array_setNeedsUpdate,st.prototype._setValue_array_setMatrixWorldNeedsUpdate],[st.prototype._setValue_arrayElement,st.prototype._setValue_arrayElement_setNeedsUpdate,st.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[st.prototype._setValue_fromArray,st.prototype._setValue_fromArray_setNeedsUpdate,st.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var Ny=new Float32Array(1);var bh=new Le,Fr=class{constructor(e,t,n=0,s=1/0){this.ray=new _i(e,t),this.near=n,this.far=s,this.camera=null,this.layers=new Es,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(e,t){this.ray.set(e,t)}setFromCamera(e,t){t.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(e.x,e.y,.5).unproject(t).sub(this.ray.origin).normalize(),this.camera=t):t.isOrthographicCamera?(this.ray.origin.set(e.x,e.y,t.projectionMatrix.elements[14]).unproject(t),this.ray.direction.set(0,0,-1).transformDirection(t.matrixWorld),this.camera=t):Ne("Raycaster: Unsupported camera type: "+t.type)}setFromXRController(e){return bh.identity().extractRotation(e.matrixWorld),this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(bh),this}intersectObject(e,t=!0,n=[]){return nc(e,this,n,t),n.sort(Th),n}intersectObjects(e,t=!0,n=[]){for(let s=0,r=e.length;s<r;s++)nc(e[s],this,n,t);return n.sort(Th),n}};function Th(i,e){return i.distance-e.distance}function nc(i,e,t,n){let s=!0;if(i.layers.test(e.layers)&&i.raycast(e,t)===!1&&(s=!1),s===!0&&n===!0){let r=i.children;for(let a=0,o=r.length;a<o;a++)nc(r[a],e,t,!0)}}var Br=class{constructor(e=!0){this.autoStart=e,this.startTime=0,this.oldTime=0,this.elapsedTime=0,this.running=!1,be("Clock: This module has been deprecated. Please use THREE.Timer instead.")}start(){this.startTime=performance.now(),this.oldTime=this.startTime,this.elapsedTime=0,this.running=!0}stop(){this.getElapsedTime(),this.running=!1,this.autoStart=!1}getElapsedTime(){return this.getDelta(),this.elapsedTime}getDelta(){let e=0;if(this.autoStart&&!this.running)return this.start(),0;if(this.running){let t=performance.now();e=(t-this.oldTime)/1e3,this.oldTime=t,this.elapsedTime+=e}return e}};var ic=class{static{this.prototype.isMatrix2=!0}constructor(e,t,n,s){this.elements=[1,0,0,1],e!==void 0&&this.set(e,t,n,s)}identity(){return this.set(1,0,0,1),this}fromArray(e,t=0){for(let n=0;n<4;n++)this.elements[n]=e[n+t];return this}set(e,t,n,s){let r=this.elements;return r[0]=e,r[2]=t,r[1]=n,r[3]=s,this}};function Cc(i,e,t,n){let s=pp(n);switch(t){case pc:return i*e;case Hs:return i*e/s.components*s.byteLength;case vo:return i*e/s.components*s.byteLength;case wi:return i*e*2/s.components*s.byteLength;case _o:return i*e*2/s.components*s.byteLength;case mc:return i*e*3/s.components*s.byteLength;case ln:return i*e*4/s.components*s.byteLength;case So:return i*e*4/s.components*s.byteLength;case Xr:case Kr:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*8;case jr:case Zr:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case bo:case wo:return Math.max(i,16)*Math.max(e,8)/4;case Mo:case To:return Math.max(i,8)*Math.max(e,8)/2;case Eo:case Ao:case Co:case Io:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*8;case Ro:case Yr:case Po:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case No:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case Lo:return Math.floor((i+4)/5)*Math.floor((e+3)/4)*16;case Uo:return Math.floor((i+4)/5)*Math.floor((e+4)/5)*16;case Do:return Math.floor((i+5)/6)*Math.floor((e+4)/5)*16;case Oo:return Math.floor((i+5)/6)*Math.floor((e+5)/6)*16;case Fo:return Math.floor((i+7)/8)*Math.floor((e+4)/5)*16;case Bo:return Math.floor((i+7)/8)*Math.floor((e+5)/6)*16;case Vo:return Math.floor((i+7)/8)*Math.floor((e+7)/8)*16;case ko:return Math.floor((i+9)/10)*Math.floor((e+4)/5)*16;case zo:return Math.floor((i+9)/10)*Math.floor((e+5)/6)*16;case Go:return Math.floor((i+9)/10)*Math.floor((e+7)/8)*16;case Ho:return Math.floor((i+9)/10)*Math.floor((e+9)/10)*16;case Wo:return Math.floor((i+11)/12)*Math.floor((e+9)/10)*16;case qo:return Math.floor((i+11)/12)*Math.floor((e+11)/12)*16;case Xo:case Ko:case jo:return Math.ceil(i/4)*Math.ceil(e/4)*16;case Zo:case Yo:return Math.ceil(i/4)*Math.ceil(e/4)*8;case Jr:case Jo:return Math.ceil(i/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function pp(i){switch(i){case on:case uc:return{byteLength:1,components:1};case Gs:case hc:case _t:return{byteLength:2,components:1};case xo:case yo:return{byteLength:2,components:4};case Cn:case go:case fn:return{byteLength:4,components:1};case dc:case fc:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${i}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"187"}}));typeof window<"u"&&(window.__THREE__?be("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="187");function Id(){let i=null,e=!1,t=null,n=null;function s(r,a){n=i.requestAnimationFrame(s),t(r,a)}return{start:function(){e!==!0&&t!==null&&i!==null&&(n=i.requestAnimationFrame(s),e=!0)},stop:function(){i!==null&&i.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(r){t=r},setContext:function(r){i=r}}}function gp(i){let e=new WeakMap;function t(o,l){let c=o.array,u=o.usage,h=c.byteLength,d=i.createBuffer();i.bindBuffer(l,d),i.bufferData(l,c,u),o.onUploadCallback();let f;if(c instanceof Float32Array)f=i.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)f=i.HALF_FLOAT;else if(c instanceof Uint16Array)o.isFloat16BufferAttribute?f=i.HALF_FLOAT:f=i.UNSIGNED_SHORT;else if(c instanceof Int16Array)f=i.SHORT;else if(c instanceof Uint32Array)f=i.UNSIGNED_INT;else if(c instanceof Int32Array)f=i.INT;else if(c instanceof Int8Array)f=i.BYTE;else if(c instanceof Uint8Array)f=i.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)f=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:d,type:f,bytesPerElement:c.BYTES_PER_ELEMENT,version:o.version,size:h}}function n(o,l,c){let u=l.array,h=l.updateRanges;if(i.bindBuffer(c,o),h.length===0)i.bufferSubData(c,0,u);else{h.sort((f,g)=>f.start-g.start);let d=0;for(let f=1;f<h.length;f++){let g=h[d],_=h[f];_.start<=g.start+g.count+1?g.count=Math.max(g.count,_.start+_.count-g.start):(++d,h[d]=_)}h.length=d+1;for(let f=0,g=h.length;f<g;f++){let _=h[f];i.bufferSubData(c,_.start*u.BYTES_PER_ELEMENT,u,_.start,_.count)}l.clearUpdateRanges()}l.onUploadCallback()}function s(o){return o.isInterleavedBufferAttribute&&(o=o.data),e.get(o)}function r(o){o.isInterleavedBufferAttribute&&(o=o.data);let l=e.get(o);l&&(i.deleteBuffer(l.buffer),e.delete(o))}function a(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){let u=e.get(o);(!u||u.version<o.version)&&e.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}let c=e.get(o);if(c===void 0)e.set(o,t(o,l));else if(c.version<o.version){if(c.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,o,l),c.version=o.version}}return{get:s,remove:r,update:a}}var xp=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,yp=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,vp=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,_p=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Sp=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,Mp=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,bp=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,Tp=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,wp=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,Ep=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Ap=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,Rp=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,Cp=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,Ip=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,Pp=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,Np=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,Lp=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Up=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Dp=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,Op=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,Fp=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,Bp=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,Vp=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,kp=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,zp=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,Gp=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Hp=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Wp=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,qp=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Xp="gl_FragColor = linearToOutputTexel( gl_FragColor );",Kp=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,jp=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,Zp=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	uniform samplerCube envMap;
	#ifdef ENVMAP_TYPE_PMREM
		float roughnessToMip( const in float roughness ) {
			float r = clamp( roughness, 0.0, 1.0 );
			return ENVMAP_MAX_LOD * r * ( 2.0 - r );
		}
	#endif
#endif`,Yp=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,Jp=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Qp=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,$p=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,em=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,tm=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,nm=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,im=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,sm=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,rm=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,am=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,om=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_SUN_LIGHTS > 0
	struct SunLight {
		vec3 direction;
		vec3 color;
	};
	uniform SunLight sunLights[ NUM_SUN_LIGHTS ];
	void getSunLightInfo( const in SunLight sunLight, out IncidentLight light ) {
		light.color = sunLight.color;
		light.direction = sunLight.direction;
		light.visible = true;
	}
#endif
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,lm=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_PMREM
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureLod( envMap, envMapRotation * worldNormal, ENVMAP_MAX_LOD );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_PMREM
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureLod( envMap, envMapRotation * reflectVec, roughnessToMip( roughness ) );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_RETROREFLECTION
		vec3 getIBLRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
			#ifdef ENVMAP_TYPE_PMREM
				vec3 retroVec = normalize( mix( viewDir, normal, pow4( roughness ) ) );
				retroVec = transformDirectionByInverseViewMatrix( retroVec, viewMatrix );
				vec4 envMapColor = textureLod( envMap, envMapRotation * retroVec, roughnessToMip( roughness ) );
				return envMapColor.rgb * envMapIntensity;
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_PMREM
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
		#ifdef USE_RETROREFLECTION
			vec3 getIBLAnisotropyRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
				#ifdef ENVMAP_TYPE_PMREM
					vec3 bentNormal = cross( bitangent, viewDir );
					bentNormal = normalize( cross( bentNormal, bitangent ) );
					bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
					return getIBLRetroRadiance( viewDir, bentNormal, roughness );
				#else
					return vec3( 0.0 );
				#endif
			}
		#endif
	#endif
#endif`,cm=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,um=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,hm=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,dm=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,fm=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.045 );
material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef USE_DIFFUSE_ROUGHNESS
	float diffuseRoughnessFactor = diffuseRoughness;
	#ifdef USE_DIFFUSE_ROUGHNESSMAP
		diffuseRoughnessFactor *= texture2D( diffuseRoughnessMap, vDiffuseRoughnessMapUv ).r;
	#endif
	material.diffuseRoughness = saturate( diffuseRoughnessFactor );
#endif
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.045 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_RETROREFLECTION
	material.retroreflectivity = retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,pm=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	vec2 dfg;
	vec3 multiScatteringCompensation;
	#ifdef USE_DIFFUSE_ROUGHNESS
		float diffuseRoughness;
	#endif
	#ifdef USE_RETROREFLECTION
		float retroreflectivity;
	#endif
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0Dielectric;
		vec3 iridescenceF0Metallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
#ifdef USE_DIFFUSE_ROUGHNESS
	const float EON_EPSILON = 1e-7;
	float FON_DirectionalAlbedo( const in float mu, const in float roughness, const in float A ) {
		float muComp = 1.0 - mu;
		float gOverPi = muComp * ( 0.0571085289 + muComp * ( 0.491881867 + muComp * ( - 0.332181442 + muComp * 0.0714429953 ) ) );
		return A * ( 1.0 + roughness * gOverPi );
	}
	vec3 BRDF_EON( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 diffuseColor, const in float roughness ) {
		vec3 rho = saturate( diffuseColor );
		if ( roughness <= EON_EPSILON ) return BRDF_Lambert( rho );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float s = dot( lightDir, viewDir ) - dotNL * dotNV;
		float sOverT = ( s > 0.0 ) ? s / max( max( dotNL, dotNV ), EON_EPSILON ) : s;
		float A = 1.0 / ( 1.0 + ( 0.5 - 2.0 / ( 3.0 * PI ) ) * roughness );
		vec3 singleScatter = rho * RECIPROCAL_PI * A * ( 1.0 + roughness * sOverT );
		float averageAlbedo = A * ( 1.0 + ( 2.0 / 3.0 - 28.0 / ( 15.0 * PI ) ) * roughness );
		float albedoV = FON_DirectionalAlbedo( dotNV, roughness, A );
		float albedoL = FON_DirectionalAlbedo( dotNL, roughness, A );
		vec3 rhoMultiScatter = rho * rho * averageAlbedo / max( vec3( EON_EPSILON ), vec3( 1.0 ) - rho * ( 1.0 - averageAlbedo ) );
		vec3 multiScatter = rhoMultiScatter * RECIPROCAL_PI
			* max( EON_EPSILON, 1.0 - albedoV )
			* max( EON_EPSILON, 1.0 - albedoL )
			/ max( EON_EPSILON, 1.0 - averageAlbedo );
		return singleScatter + multiScatter;
	}
	vec3 EON_DirectionalAlbedo( const in vec3 diffuseColor, const in float roughness, const in float dotNV ) {
		vec3 rho = saturate( diffuseColor );
		if ( roughness <= EON_EPSILON ) return rho;
		float A = 1.0 / ( 1.0 + ( 0.5 - 2.0 / ( 3.0 * PI ) ) * roughness );
		float directionalAlbedo = FON_DirectionalAlbedo( dotNV, roughness, A );
		float averageAlbedo = A * ( 1.0 + ( 2.0 / 3.0 - 28.0 / ( 15.0 * PI ) ) * roughness );
		vec3 rhoMultiScatter = rho * rho * averageAlbedo / max( vec3( EON_EPSILON ), vec3( 1.0 ) - rho * ( 1.0 - averageAlbedo ) );
		return rho * directionalAlbedo + rhoMultiScatter * ( 1.0 - directionalAlbedo );
	}
#endif
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = max( material.clearcoatRoughness, 0.045 );
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = max( material.roughness, 0.045 );
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float alphaT = max( material.alphaT, alpha );
		float V = V_GGX_SmithCorrelated_Anisotropic( alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec2 fab, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec2 fab, const in vec3 specularColor, const in float specularF90, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	#ifdef USE_RETROREFLECTION
		vec3 retroViewDir = reflect( - geometryViewDir, geometryNormal );
		vec3 retroSpecularBRDF = BRDF_GGX( directLight.direction, retroViewDir, geometryNormal, material );
		specularBRDF = mix( specularBRDF, retroSpecularBRDF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;
	vec3 halfDir = normalize( directLight.direction + geometryViewDir );
	float dotVH = saturate( dot( geometryViewDir, halfDir ) );
	vec3 F = F_Schlick( material.specularColor, material.specularF90, dotVH );
	#ifdef USE_RETROREFLECTION
		vec3 retroHalfDir = normalize( directLight.direction + retroViewDir );
		float dotRetroVH = saturate( dot( retroViewDir, retroHalfDir ) );
		vec3 retroF = F_Schlick( material.specularColor, material.specularF90, dotRetroVH );
		F = mix( F, retroF, saturate( material.retroreflectivity ) );
	#endif
	#ifdef USE_DIFFUSE_ROUGHNESS
		vec3 diffuseBRDF = BRDF_EON( directLight.direction, geometryViewDir, geometryNormal, material.diffuseColor, material.diffuseRoughness ) * ( 1.0 - material.metalness );
	#else
		vec3 diffuseBRDF = BRDF_Lambert( material.diffuseContribution );
	#endif
	reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScattering, multiScattering );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScattering, multiScattering );
	#endif
	#ifdef USE_DIFFUSE_ROUGHNESS
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		vec3 diffuseAlbedo = EON_DirectionalAlbedo( material.diffuseColor, material.diffuseRoughness, dotNV ) * ( 1.0 - material.metalness );
		vec3 diffuse = irradiance * RECIPROCAL_PI * diffuseAlbedo * ( 1.0 - singleScattering - multiScattering );
	#else
		vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering );
	#endif
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		sheenSpecularIndirect += irradiance * material.sheenColor * sheenAlbedo * RECIPROCAL_PI;
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( material.dfg, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceF0Metallic, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( material.dfg, material.diffuseColor, material.specularF90, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	#ifdef USE_DIFFUSE_ROUGHNESS
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		vec3 diffuse = EON_DirectionalAlbedo( material.diffuseColor, material.diffuseRoughness, dotNV ) * ( 1.0 - material.metalness ) * ( 1.0 - totalScatteringDielectric );
	#else
		vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	#endif
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,mm=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		vec3 iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		vec3 iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( iridescenceFresnelDielectric, iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0Dielectric = Schlick_to_F0( iridescenceFresnelDielectric, 1.0, dotNVi );
		material.iridescenceF0Metallic = Schlick_to_F0( iridescenceFresnelMetallic, 1.0, dotNVi );
	}
#endif
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
		float EssMs = material.dfg.x + material.dfg.y;
		material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
	#endif
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )
	SunLight sunLight;
	#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHTS; i ++ ) {
		sunLight = sunLights[ i ];
		getSunLightInfo( sunLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS )
		sunLightShadow = sunLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_LIGHT_PROBE_GRIDS > 0
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		int probeGrid = - 1;
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_LIGHT_PROBE_GRIDS; i ++ ) {
			if ( isInsideLightProbeGrid( probeWorldPos, probeWorldNormal, probesMin[ i ], probesMax[ i ], probesResolution[ i ] ) ) probeGrid = UNROLLED_LOOP_INDEX;
		}
		#pragma unroll_loop_end
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_LIGHT_PROBE_GRIDS; i ++ ) {
			if ( probeGrid == UNROLLED_LOOP_INDEX ) irradiance += getLightProbeGridIrradiance( probesSH[ i ], probesMin[ i ], probesMax[ i ], probesResolution[ i ], probeWorldPos, probeWorldNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,gm=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_PMREM )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		vec3 iblRadiance = getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_RETROREFLECTION
		#ifdef USE_ANISOTROPY
			vec3 retroIBLRadiance = getIBLAnisotropyRetroRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
		#else
			vec3 retroIBLRadiance = getIBLRetroRadiance( geometryViewDir, geometryNormal, material.roughness );
		#endif
		iblRadiance = mix( iblRadiance, retroIBLRadiance, saturate( material.retroreflectivity ) );
	#endif
	radiance += iblRadiance;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,xm=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,ym=`#if NUM_LIGHT_PROBE_GRIDS > 0
uniform highp sampler3D probesSH[ NUM_LIGHT_PROBE_GRIDS ];
uniform vec3 probesMin[ NUM_LIGHT_PROBE_GRIDS ];
uniform vec3 probesMax[ NUM_LIGHT_PROBE_GRIDS ];
uniform vec3 probesResolution[ NUM_LIGHT_PROBE_GRIDS ];
bool isInsideLightProbeGrid( vec3 worldPos, vec3 worldNormal, vec3 probesMin, vec3 probesMax, vec3 probesResolution ) {
	vec3 spacing = ( probesMax - probesMin ) / probesResolution;
	vec3 samplePos = worldPos + worldNormal * spacing * 0.5;
	vec3 margin = spacing * 0.01;
	return all( greaterThanEqual( samplePos, probesMin - margin ) ) && all( lessThanEqual( samplePos, probesMax + margin ) );
}
vec3 getLightProbeGridIrradiance( highp sampler3D probesSH, vec3 probesMin, vec3 probesMax, vec3 probesResolution, vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 probeSpacing = gridRange / res;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.5 / res, 1.0 - 0.5 / res );
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,vm=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,_m=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Sm=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Mm=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,bm=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,Tm=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,wm=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,Em=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Am=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Rm=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,Cm=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,Im=`#if defined( USE_MORPHCOLORS )
	#if defined( USE_COLOR_ALPHA )
		vColor *= morphTargetBaseInfluence;
	#elif defined( USE_COLOR )
		vColor.rgb *= morphTargetBaseInfluence;
	#endif
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor.rgb += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,Pm=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Nm=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,Lm=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Um=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,Dm=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,Om=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Fm=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Bm=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,Vm=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,km=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,zm=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,Gm=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,Hm=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,Wm=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,qm=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,Xm=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Km=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,jm=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Zm=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Ym=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Jm=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,Qm=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		#define SUN_LIGHT_CASCADES 2
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#else
			uniform sampler2D sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#endif
		uniform mat4 sunShadowMatrix[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		uniform vec4 sunShadowCascade[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
		struct SunLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SunLightShadow sunLightShadows[ NUM_SUN_LIGHT_SHADOWS ];
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				vec2 radius = shadowRadius * texelSize;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_SUN_LIGHT_SHADOWS > 0
		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {
			vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
			float viewDepth = vSunShadowWorldPosition.w;
			int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
			float shadow = 1.0;
			for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
				vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
				if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
					float cascadeShadow = getShadow(
						shadowMap,
						sunLightShadow.shadowMapSize,
						sunLightShadow.shadowIntensity,
						sunLightShadow.shadowBias,
						sunLightShadow.shadowRadius,
						sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition
					);
					shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
				}
			}
			return shadow;
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float lightDistance = length( lightToPosition );
			float depthRange = shadowCameraFar - shadowCameraNear;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float depthA = - shadowCameraNear / depthRange - shadowBias;
				float depthB = shadowCameraNear * shadowCameraFar / ( depthRange * lightDistance );
			#else
				float depthA = shadowCameraFar / depthRange + shadowBias;
				float depthB = - shadowCameraNear * shadowCameraFar / ( depthRange * lightDistance );
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			shadow = 0.0;
			for ( int i = 0; i < 5; i ++ ) {
				vec2 offset = vogelDiskSample( i, 5, phi );
				vec3 direction = bd3D + ( tangent * offset.x + bitangent * offset.y ) * texelSize;
				vec3 absDirection = abs( direction );
				float dp = depthA + depthB / max( max( absDirection.x, absDirection.y ), absDirection.z );
				shadow += texture( shadowMap, vec4( direction, dp ) );
			}
			shadow *= 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,$m=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,eg=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_SUN_LIGHT_SHADOWS > 0
		vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );
		vSunShadowWorldNormal = shadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,tg=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHT_SHADOWS; i ++ ) {
		sunLight = sunLightShadows[ i ];
		shadow *= receiveShadow ? getSunShadow( sunShadowMap[ i ], sunLight, UNROLLED_LOOP_INDEX ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,ng=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,ig=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,sg=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,rg=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,ag=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,og=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,lg=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,cg=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,ug=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,hg=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,dg=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_DIFFUSE_ROUGHNESSMAP
	varying vec2 vDiffuseRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,fg=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_DIFFUSE_ROUGHNESSMAP
	uniform mat3 diffuseRoughnessMapTransform;
	varying vec2 vDiffuseRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,pg=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DIFFUSE_ROUGHNESSMAP
	vDiffuseRoughnessMapUv = ( diffuseRoughnessMapTransform * vec3( DIFFUSE_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,mg=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,gg=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,xg=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,yg=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,vg=`uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <envmap_common_pars_fragment>
void main() {
	#ifdef ENVMAP_TYPE_PMREM
		vec4 texColor = textureLod( envMap, backgroundRotation * vWorldDirection, roughnessToMip( backgroundBlurriness ) );
	#else
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,_g=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Sg=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Mg=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,bg=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,Tg=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,wg=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,Eg=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,Ag=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Rg=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Cg=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Ig=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,Pg=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Ng=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Lg=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Ug=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,Dg=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Og=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,Fg=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,Bg=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Vg=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,kg=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,zg=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DIFFUSE_ROUGHNESS
	uniform float diffuseRoughness;
	#ifdef USE_DIFFUSE_ROUGHNESSMAP
		uniform sampler2D diffuseRoughnessMap;
	#endif
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
	uniform float retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Gg=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Hg=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Wg=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,qg=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Xg=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Kg=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,jg=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Zg=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Ge={alphahash_fragment:xp,alphahash_pars_fragment:yp,alphamap_fragment:vp,alphamap_pars_fragment:_p,alphatest_fragment:Sp,alphatest_pars_fragment:Mp,aomap_fragment:bp,aomap_pars_fragment:Tp,batching_pars_vertex:wp,batching_vertex:Ep,begin_vertex:Ap,beginnormal_vertex:Rp,bsdfs:Cp,iridescence_fragment:Ip,bumpmap_pars_fragment:Pp,clipping_planes_fragment:Np,clipping_planes_pars_fragment:Lp,clipping_planes_pars_vertex:Up,clipping_planes_vertex:Dp,color_fragment:Op,color_pars_fragment:Fp,color_pars_vertex:Bp,color_vertex:Vp,common:kp,defaultnormal_vertex:zp,displacementmap_pars_vertex:Gp,displacementmap_vertex:Hp,emissivemap_fragment:Wp,emissivemap_pars_fragment:qp,colorspace_fragment:Xp,colorspace_pars_fragment:Kp,envmap_fragment:jp,envmap_common_pars_fragment:Zp,envmap_pars_fragment:Yp,envmap_pars_vertex:Jp,envmap_physical_pars_fragment:lm,envmap_vertex:Qp,fog_vertex:$p,fog_pars_vertex:em,fog_fragment:tm,fog_pars_fragment:nm,gradientmap_pars_fragment:im,lightmap_pars_fragment:sm,lights_lambert_fragment:rm,lights_lambert_pars_fragment:am,lights_pars_begin:om,lights_toon_fragment:cm,lights_toon_pars_fragment:um,lights_phong_fragment:hm,lights_phong_pars_fragment:dm,lights_physical_fragment:fm,lights_physical_pars_fragment:pm,lights_fragment_begin:mm,lights_fragment_maps:gm,lights_fragment_end:xm,lightprobes_pars_fragment:ym,logdepthbuf_fragment:vm,logdepthbuf_pars_fragment:_m,logdepthbuf_pars_vertex:Sm,logdepthbuf_vertex:Mm,map_fragment:bm,map_pars_fragment:Tm,map_particle_fragment:wm,map_particle_pars_fragment:Em,metalnessmap_fragment:Am,metalnessmap_pars_fragment:Rm,morphinstance_vertex:Cm,morphcolor_vertex:Im,morphnormal_vertex:Pm,morphtarget_pars_vertex:Nm,morphtarget_vertex:Lm,normal_fragment_begin:Um,normal_fragment_maps:Dm,normal_pars_fragment:Om,normal_pars_vertex:Fm,normal_vertex:Bm,normalmap_pars_fragment:Vm,clearcoat_normal_fragment_begin:km,clearcoat_normal_fragment_maps:zm,clearcoat_pars_fragment:Gm,iridescence_pars_fragment:Hm,opaque_fragment:Wm,packing:qm,premultiplied_alpha_fragment:Xm,project_vertex:Km,dithering_fragment:jm,dithering_pars_fragment:Zm,roughnessmap_fragment:Ym,roughnessmap_pars_fragment:Jm,shadowmap_pars_fragment:Qm,shadowmap_pars_vertex:$m,shadowmap_vertex:eg,shadowmask_pars_fragment:tg,skinbase_vertex:ng,skinning_pars_vertex:ig,skinning_vertex:sg,skinnormal_vertex:rg,specularmap_fragment:ag,specularmap_pars_fragment:og,tonemapping_fragment:lg,tonemapping_pars_fragment:cg,transmission_fragment:ug,transmission_pars_fragment:hg,uv_pars_fragment:dg,uv_pars_vertex:fg,uv_vertex:pg,worldpos_vertex:mg,background_vert:gg,background_frag:xg,backgroundCube_vert:yg,backgroundCube_frag:vg,cube_vert:_g,cube_frag:Sg,depth_vert:Mg,depth_frag:bg,distance_vert:Tg,distance_frag:wg,equirect_vert:Eg,equirect_frag:Ag,linedashed_vert:Rg,linedashed_frag:Cg,meshbasic_vert:Ig,meshbasic_frag:Pg,meshlambert_vert:Ng,meshlambert_frag:Lg,meshmatcap_vert:Ug,meshmatcap_frag:Dg,meshnormal_vert:Og,meshnormal_frag:Fg,meshphong_vert:Bg,meshphong_frag:Vg,meshphysical_vert:kg,meshphysical_frag:zg,meshtoon_vert:Gg,meshtoon_frag:Hg,points_vert:Wg,points_frag:qg,shadow_vert:Xg,shadow_frag:Kg,sprite_vert:jg,sprite_frag:Zg},me={common:{diffuse:{value:new Te(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Ue},alphaMap:{value:null},alphaMapTransform:{value:new Ue},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Ue}},envmap:{envMap:{value:null},envMapRotation:{value:new Ue},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Ue}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Ue}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Ue},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Ue},normalScale:{value:new Ee(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Ue},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Ue}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Ue}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Ue}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Te(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:[]},probesMin:{value:[]},probesMax:{value:[]},probesResolution:{value:[]}},points:{diffuse:{value:new Te(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Ue},alphaTest:{value:0},uvTransform:{value:new Ue}},sprite:{diffuse:{value:new Te(16777215)},opacity:{value:1},center:{value:new Ee(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Ue},alphaMap:{value:null},alphaMapTransform:{value:new Ue},alphaTest:{value:0}}},kn={basic:{uniforms:Kt([me.common,me.specularmap,me.envmap,me.aomap,me.lightmap,me.fog]),vertexShader:Ge.meshbasic_vert,fragmentShader:Ge.meshbasic_frag},lambert:{uniforms:Kt([me.common,me.specularmap,me.envmap,me.aomap,me.lightmap,me.emissivemap,me.bumpmap,me.normalmap,me.displacementmap,me.fog,me.lights,{emissive:{value:new Te(0)},envMapIntensity:{value:1}}]),vertexShader:Ge.meshlambert_vert,fragmentShader:Ge.meshlambert_frag},phong:{uniforms:Kt([me.common,me.specularmap,me.envmap,me.aomap,me.lightmap,me.emissivemap,me.bumpmap,me.normalmap,me.displacementmap,me.fog,me.lights,{emissive:{value:new Te(0)},specular:{value:new Te(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Ge.meshphong_vert,fragmentShader:Ge.meshphong_frag},standard:{uniforms:Kt([me.common,me.envmap,me.aomap,me.lightmap,me.emissivemap,me.bumpmap,me.normalmap,me.displacementmap,me.roughnessmap,me.metalnessmap,me.fog,me.lights,{emissive:{value:new Te(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ge.meshphysical_vert,fragmentShader:Ge.meshphysical_frag},toon:{uniforms:Kt([me.common,me.aomap,me.lightmap,me.emissivemap,me.bumpmap,me.normalmap,me.displacementmap,me.gradientmap,me.fog,me.lights,{emissive:{value:new Te(0)}}]),vertexShader:Ge.meshtoon_vert,fragmentShader:Ge.meshtoon_frag},matcap:{uniforms:Kt([me.common,me.bumpmap,me.normalmap,me.displacementmap,me.fog,{matcap:{value:null}}]),vertexShader:Ge.meshmatcap_vert,fragmentShader:Ge.meshmatcap_frag},points:{uniforms:Kt([me.points,me.fog]),vertexShader:Ge.points_vert,fragmentShader:Ge.points_frag},dashed:{uniforms:Kt([me.common,me.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ge.linedashed_vert,fragmentShader:Ge.linedashed_frag},depth:{uniforms:Kt([me.common,me.displacementmap]),vertexShader:Ge.depth_vert,fragmentShader:Ge.depth_frag},normal:{uniforms:Kt([me.common,me.bumpmap,me.normalmap,me.displacementmap,{opacity:{value:1}}]),vertexShader:Ge.meshnormal_vert,fragmentShader:Ge.meshnormal_frag},sprite:{uniforms:Kt([me.sprite,me.fog]),vertexShader:Ge.sprite_vert,fragmentShader:Ge.sprite_frag},background:{uniforms:{uvTransform:{value:new Ue},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ge.background_vert,fragmentShader:Ge.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Ue}},vertexShader:Ge.backgroundCube_vert,fragmentShader:Ge.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ge.cube_vert,fragmentShader:Ge.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ge.equirect_vert,fragmentShader:Ge.equirect_frag},distance:{uniforms:Kt([me.common,me.displacementmap,{referencePosition:{value:new D},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Ge.distance_vert,fragmentShader:Ge.distance_frag},shadow:{uniforms:Kt([me.lights,me.fog,{color:{value:new Te(0)},opacity:{value:1}}]),vertexShader:Ge.shadow_vert,fragmentShader:Ge.shadow_frag}};kn.physical={uniforms:Kt([kn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Ue},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Ue},clearcoatNormalScale:{value:new Ee(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Ue},diffuseRoughness:{value:0},diffuseRoughnessMap:{value:null},diffuseRoughnessMapTransform:{value:new Ue},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Ue},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Ue},sheen:{value:0},sheenColor:{value:new Te(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Ue},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Ue},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Ue},transmissionSamplerSize:{value:new Ee},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Ue},attenuationDistance:{value:0},attenuationColor:{value:new Te(0)},specularColor:{value:new Te(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Ue},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Ue},anisotropyVector:{value:new Ee},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Ue}}]),vertexShader:Ge.meshphysical_vert,fragmentShader:Ge.meshphysical_frag};var el={r:0,b:0,g:0},Yg=new Le,Pd=new Ue;Pd.set(-1,0,0,0,1,0,0,0,1);function Jg(i,e,t,n,s,r){let a=new Te(0),o=s===!0?0:1,l,c,u=null,h=0,d=null;function f(y){let w=y.isScene===!0?y.background:null;if(w&&w.isTexture){let M=y.backgroundBlurriness>0;w=e.get(w,M)}return w}function g(y){let w=!1,M=f(y);M===null?m(a,o):M&&M.isColor&&(m(M,1),w=!0);let b=i.xr.getEnvironmentBlendMode();b==="additive"?t.buffers.color.setClear(0,0,0,1,r):b==="alpha-blend"&&t.buffers.color.setClear(0,0,0,0,r),(i.autoClear||w)&&(t.buffers.depth.setTest(!0),t.buffers.depth.setMask(!0),t.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function _(y,w){let M=f(w);M&&M.isCubeTexture?(c===void 0&&(c=new je(new dn(1,1,1),new dt({name:"BackgroundCubeMaterial",uniforms:Qi(kn.backgroundCube.uniforms),vertexShader:kn.backgroundCube.vertexShader,fragmentShader:kn.backgroundCube.fragmentShader,side:Rt,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(b,E,x){this.matrixWorld.copyPosition(x.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),c.material.uniforms.envMap.value=M,c.material.uniforms.backgroundBlurriness.value=w.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=w.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(Yg.makeRotationFromEuler(w.backgroundRotation)).transpose(),M.isRenderTargetTexture===!1&&c.material.uniforms.backgroundRotation.value.premultiply(Pd),c.material.toneMapped=Ve.getTransfer(M.colorSpace)!==Je,(u!==M||h!==M.version||d!==i.toneMapping)&&(c.material.needsUpdate=!0,u=M,h=M.version,d=i.toneMapping),c.layers.enableAll(),y.unshift(c,c.geometry,c.material,0,0,null)):M&&M.isTexture&&(l===void 0&&(l=new je(new ki(2,2),new dt({name:"BackgroundMaterial",uniforms:Qi(kn.background.uniforms),vertexShader:kn.background.vertexShader,fragmentShader:kn.background.fragmentShader,side:Mn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(l)),l.material.uniforms.t2D.value=M,l.material.uniforms.backgroundIntensity.value=w.backgroundIntensity,l.material.toneMapped=Ve.getTransfer(M.colorSpace)!==Je,M.matrixAutoUpdate===!0&&M.updateMatrix(),l.material.uniforms.uvTransform.value.copy(M.matrix),(u!==M||h!==M.version||d!==i.toneMapping)&&(l.material.needsUpdate=!0,u=M,h=M.version,d=i.toneMapping),l.layers.enableAll(),y.unshift(l,l.geometry,l.material,0,0,null))}function m(y,w){y.getRGB(el,Ec(i)),t.buffers.color.setClear(el.r,el.g,el.b,w,r)}function p(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return a},setClearColor:function(y,w=1){a.set(y),o=w,m(a,o)},getClearAlpha:function(){return o},setClearAlpha:function(y){o=y,m(a,o)},render:g,addToRenderList:_,dispose:p}}function Qg(i,e){let t=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},s=d(null),r=s,a=!1;function o(P,F,G,A,U){let B=!1,V=h(P,A,G,F);r!==V&&(r=V,c(r.object)),B=f(P,A,G,U),B&&g(P,A,G,U),U!==null&&e.update(U,i.ELEMENT_ARRAY_BUFFER),(B||a)&&(a=!1,M(P,F,G,A),U!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,e.get(U).buffer))}function l(){return i.createVertexArray()}function c(P){return i.bindVertexArray(P)}function u(P){return i.deleteVertexArray(P)}function h(P,F,G,A){let U=A.wireframe===!0,B=n[F.id];B===void 0&&(B={},n[F.id]=B);let V=P.isInstancedMesh===!0?P.id:0,$=B[V];$===void 0&&($={},B[V]=$);let q=$[G.id];q===void 0&&(q={},$[G.id]=q);let Q=q[U];return Q===void 0&&(Q=d(l()),q[U]=Q),Q}function d(P){let F=[],G=[],A=[];for(let U=0;U<t;U++)F[U]=0,G[U]=0,A[U]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:F,enabledAttributes:G,attributeDivisors:A,object:P,attributes:{},index:null}}function f(P,F,G,A){let U=r.attributes,B=F.attributes,V=0,$=G.getAttributes();for(let q in $)if($[q].location>=0){let ee=U[q],ve=B[q];if(ve===void 0&&(q==="instanceMatrix"&&P.instanceMatrix&&(ve=P.instanceMatrix),q==="instanceColor"&&P.instanceColor&&(ve=P.instanceColor)),ee===void 0||ee.attribute!==ve||ve&&ee.data!==ve.data)return!0;V++}return r.attributesNum!==V||r.index!==A}function g(P,F,G,A){let U={},B=F.attributes,V=0,$=G.getAttributes();for(let q in $)if($[q].location>=0){let ee=B[q];ee===void 0&&(q==="instanceMatrix"&&P.instanceMatrix&&(ee=P.instanceMatrix),q==="instanceColor"&&P.instanceColor&&(ee=P.instanceColor));let ve={};ve.attribute=ee,ee&&ee.data&&(ve.data=ee.data),U[q]=ve,V++}r.attributes=U,r.attributesNum=V,r.index=A}function _(){let P=r.newAttributes;for(let F=0,G=P.length;F<G;F++)P[F]=0}function m(P){p(P,0)}function p(P,F){let G=r.newAttributes,A=r.enabledAttributes,U=r.attributeDivisors;G[P]=1,A[P]===0&&(i.enableVertexAttribArray(P),A[P]=1),U[P]!==F&&(i.vertexAttribDivisor(P,F),U[P]=F)}function y(){let P=r.newAttributes,F=r.enabledAttributes;for(let G=0,A=F.length;G<A;G++)F[G]!==P[G]&&(i.disableVertexAttribArray(G),F[G]=0)}function w(P,F,G,A,U,B,V){V===!0?i.vertexAttribIPointer(P,F,G,U,B):i.vertexAttribPointer(P,F,G,A,U,B)}function M(P,F,G,A){_();let U=A.attributes,B=G.getAttributes(),V=F.defaultAttributeValues;for(let $ in B){let q=B[$];if(q.location>=0){let Q=U[$];if(Q===void 0&&($==="instanceMatrix"&&P.instanceMatrix&&(Q=P.instanceMatrix),$==="instanceColor"&&P.instanceColor&&(Q=P.instanceColor)),Q!==void 0){let ee=Q.normalized,ve=Q.itemSize,Ie=e.get(Q);if(Ie===void 0)continue;let j=Ie.buffer,ce=Ie.type,xe=Ie.bytesPerElement,Re=ce===i.INT||ce===i.UNSIGNED_INT||Q.gpuType===go;if(Q.isInterleavedBufferAttribute){let fe=Q.data,De=fe.isInterleavedBuffer===!0?fe.stride:fe.itemSize,St=Q.offset;if(fe.isInstancedInterleavedBuffer||fe.isInstancedBufferAttribute){for(let Pe=0;Pe<q.locationSize;Pe++)p(q.location+Pe,fe.meshPerAttribute);P.isInstancedMesh!==!0&&A._maxInstanceCount===void 0&&(A._maxInstanceCount=fe.meshPerAttribute*fe.count)}else for(let Pe=0;Pe<q.locationSize;Pe++)m(q.location+Pe);i.bindBuffer(i.ARRAY_BUFFER,j);for(let Pe=0;Pe<q.locationSize;Pe++)w(q.location+Pe,ve/q.locationSize,ce,ee,De*xe,(St+ve/q.locationSize*Pe)*xe,Re)}else{if(Q.isInstancedBufferAttribute){for(let fe=0;fe<q.locationSize;fe++)p(q.location+fe,Q.meshPerAttribute);P.isInstancedMesh!==!0&&A._maxInstanceCount===void 0&&(A._maxInstanceCount=Q.meshPerAttribute*Q.count)}else for(let fe=0;fe<q.locationSize;fe++)m(q.location+fe);i.bindBuffer(i.ARRAY_BUFFER,j);for(let fe=0;fe<q.locationSize;fe++)w(q.location+fe,ve/q.locationSize,ce,ee,ve*xe,ve/q.locationSize*fe*xe,Re)}}else if(V!==void 0){let ee=V[$];if(ee!==void 0)switch(ee.length){case 2:i.vertexAttrib2fv(q.location,ee);break;case 3:i.vertexAttrib3fv(q.location,ee);break;case 4:i.vertexAttrib4fv(q.location,ee);break;default:i.vertexAttrib1fv(q.location,ee)}}}}y()}function b(){N();for(let P in n){let F=n[P];for(let G in F){let A=F[G];for(let U in A){let B=A[U];for(let V in B)u(B[V].object),delete B[V];delete A[U]}}delete n[P]}}function E(P){if(n[P.id]===void 0)return;let F=n[P.id];for(let G in F){let A=F[G];for(let U in A){let B=A[U];for(let V in B)u(B[V].object),delete B[V];delete A[U]}}delete n[P.id]}function x(P){for(let F in n){let G=n[F];for(let A in G){let U=G[A];if(U[P.id]===void 0)continue;let B=U[P.id];for(let V in B)u(B[V].object),delete B[V];delete U[P.id]}}}function T(P){for(let F in n){let G=n[F],A=P.isInstancedMesh===!0?P.id:0,U=G[A];if(U!==void 0){for(let B in U){let V=U[B];for(let $ in V)u(V[$].object),delete V[$];delete U[B]}delete G[A],Object.keys(G).length===0&&delete n[F]}}}function N(){C(),a=!0,r!==s&&(r=s,c(r.object))}function C(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:o,reset:N,resetDefaultState:C,dispose:b,releaseStatesOfGeometry:E,releaseStatesOfObject:T,releaseStatesOfProgram:x,initAttributes:_,enableAttribute:m,disableUnusedAttributes:y}}function $g(i,e,t){let n;function s(l){n=l}function r(l,c){i.drawArrays(n,l,c),t.update(c,n,1)}function a(l,c,u){u!==0&&(i.drawArraysInstanced(n,l,c,u),t.update(c,n,u))}function o(l,c,u){if(u===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,c,0,u);let d=0;for(let f=0;f<u;f++)d+=c[f];t.update(d,n,1)}this.setMode=s,this.render=r,this.renderInstances=a,this.renderMultiDraw=o}function e0(i,e,t,n){let s;function r(){if(s!==void 0)return s;if(e.has("EXT_texture_filter_anisotropic")===!0){let x=e.get("EXT_texture_filter_anisotropic");s=i.getParameter(x.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function a(x){return!(x!==ln&&n.convert(x)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(x){let T=x===_t&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(x!==on&&x!==fn&&!T&&n.convert(x)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE))}function l(x){if(x==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";x="mediump"}return x==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=t.precision!==void 0?t.precision:"highp",u=l(c);u!==c&&(be("WebGLRenderer:",c,"not supported, using",u,"instead."),c=u);let h=t.reversedDepthBuffer===!0&&e.has("EXT_clip_control"),d=t.logarithmicDepthBuffer===!0&&h===!1;t.reversedDepthBuffer===!0&&h===!1&&be("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer."),t.logarithmicDepthBuffer===!0&&h===!0&&be("WebGLRenderer: Logarithmic depth buffer is ignored when reversed depth buffer is enabled.");let f=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),g=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),_=i.getParameter(i.MAX_TEXTURE_SIZE),m=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),p=i.getParameter(i.MAX_VERTEX_ATTRIBS),y=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),w=i.getParameter(i.MAX_VARYING_VECTORS),M=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),b=i.getParameter(i.MAX_SAMPLES),E=i.getParameter(i.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:a,textureTypeReadable:o,precision:c,logarithmicDepthBuffer:d,reversedDepthBuffer:h,maxTextures:f,maxVertexTextures:g,maxTextureSize:_,maxCubemapSize:m,maxAttributes:p,maxVertexUniforms:y,maxVaryings:w,maxFragmentUniforms:M,maxSamples:b,samples:E}}function t0(i){let e=this,t=null,n=0,s=!1,r=!1,a=new tn,o=new Ue,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(h,d){let f=h.length!==0||d||n!==0||s;return s=d,n=h.length,f},this.beginShadows=function(){r=!0,u(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(h,d){t=u(h,d,0)},this.setState=function(h,d,f){let g=h.clippingPlanes,_=h.clipIntersection,m=h.clipShadows,p=i.get(h);if(!s||g===null||g.length===0||r&&!m)r?u(null):c();else{let y=r?0:n,w=y*4,M=p.clippingState||null;l.value=M,M=u(g,d,w,f);for(let b=0;b!==w;++b)M[b]=t[b];p.clippingState=M,this.numIntersection=_?this.numPlanes:0,this.numPlanes+=y}};function c(){l.value!==t&&(l.value=t,l.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0}function u(h,d,f,g){let _=h!==null?h.length:0,m=null;if(_!==0){if(m=l.value,g!==!0||m===null){let p=f+_*4,y=d.matrixWorldInverse;o.getNormalMatrix(y),(m===null||m.length<p)&&(m=new Float32Array(p));for(let w=0,M=f;w!==_;++w,M+=4)a.copy(h[w]).applyMatrix4(y,o),a.normal.toArray(m,M),m[M+3]=a.constant}l.value=m,l.needsUpdate=!0}return e.numPlanes=_,e.numIntersection=0,m}}var $i=class extends mt{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},s=[n,n,n,n,n,n];this.texture=new wr(s),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},s=new dn(5,5,5),r=new dt({name:"CubemapFromEquirect",uniforms:Qi(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Rt,blending:oi});r.uniforms.tEquirect.value=t;let a=new je(s,r),o=t.minFilter;return t.minFilter===an&&(t.minFilter=ut),new Ti(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,s=!0){let r=e.getRenderTarget();for(let a=0;a<6;a++)e.setRenderTarget(this,a),e.clear(t,n,s);e.setRenderTarget(r)}},cd=256,n0=3,i0=20,Nd=256,Ld=16,s0=3,r0=new D,a0=new Te,Xs=class i{constructor(e){this._renderer=e,this._cubeSize=0,this._sourceTarget=null,this._cubeCamera=new Ti(1,10,null),this._boxMesh=new je(new dn(5,5,5),null),this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null,this._integrationMaterial=null}fromScene(e,t=0,n=.1,s=100,r={}){let{size:a=256,position:o=r0}=r,l=this._renderer;this._setSize(a);let c=this._allocateTarget(),u=this._getSourceTarget(!0);t>0&&(u.texture.mipmapsAutoUpdate=!1);let h=l.autoClear,d=l.autoClearColor,f=l.autoClearDepth,g=l.autoClearStencil,_=e.background;l.autoClear=!0,l.autoClearColor=!0,l.autoClearDepth=!0,l.autoClearStencil=!0,_===null&&(e.background=l.getClearColor(a0));let m=new Ti(n,s,u);return m.position.copy(o),m.update(l,e),l.autoClear=h,l.autoClearColor=d,l.autoClearDepth=f,l.autoClearStencil=g,e.background=_,t>0&&(u.texture.mipmapsAutoUpdate=!0,this._blur(c,t)),this._applyPMREM(c),c}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=dd(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=hd(),this._compileMaterial(this._equirectMaterial))}dispose(){this._sourceTarget!==null&&this._sourceTarget.dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._integrationMaterial!==null&&this._integrationMaterial.dispose(),this._boxMesh.geometry.dispose()}static lodToRoughness(e,t){return t>0?1-Math.sqrt(1-e/t):0}_setSize(e){this._cubeSize=Math.max(cd,bc(e))}_fromTexture(e,t){e.mapping===ji||e.mapping===ks?this._setSize(e.image.length===0?cd:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4);let n=t||this._allocateTarget();return this._textureToCubemap(e),this._applyPMREM(n),n}_allocateTarget(){let e=this._cubeSize,t=ud(e,!1,!1),n=Math.log2(e)-n0;for(let s=0;s<=n;s++)t.texture.mipmaps.push({width:e>>s,height:e>>s});return t.texture.name="PMREM",t.texture.isPMREMTexture=!0,t}_getSourceTarget(e=!1){let t=this._cubeSize,n=this._sourceTarget;return(n===null||n.width!==t||e&&n.depthBuffer===!1)&&(n!==null&&n.dispose(),this._sourceTarget=ud(t,!0,e)),this._sourceTarget}_compileMaterial(e){this._boxMesh.material=e,this._renderer.compile(this._boxMesh,this._cubeCamera.children[0])}_renderCube(e,t,n){let s=this._boxMesh,r=this._cubeCamera;s.material=n,r.renderTarget=e,r.activeMipmapLevel=t;let a=e.width>>t;e.viewport.set(0,0,a,a),r.update(this._renderer,s),e.viewport.set(0,0,e.width,e.height)}_textureToCubemap(e){let t;e.mapping===ji||e.mapping===ks?(this._cubemapMaterial===null&&(this._cubemapMaterial=dd()),t=this._cubemapMaterial,t.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):(this._equirectMaterial===null&&(this._equirectMaterial=hd()),t=this._equirectMaterial),t.uniforms.envMap.value=e,this._renderCube(this._getSourceTarget(),0,t)}_applyPMREM(e){this._ggxMaterial===null&&(this._ggxMaterial=o0(),this._integrationMaterial=l0());let t=this._cubeSize,n=e.texture.mipmaps.length-1,s=this._ggxMaterial.uniforms;s.envMap.value=this._sourceTarget.texture;let r=this._integrationMaterial.uniforms;r.envMap.value=this._sourceTarget.texture,r.sourceLod.value=Math.log2(t/Ld);for(let a=0;a<=n;a++){let o=i.lodToRoughness(a,n);if(a>n-s0)r.roughness.value=o,this._renderCube(e,a,this._integrationMaterial);else{let l=o>0?Math.log2(t)+.5*Math.log2(6/(Nd*Math.pow(o,4)))+.5:0;s.roughness.value=o,s.lodBias.value=l,this._renderCube(e,a,this._ggxMaterial)}}}_blur(e,t){this._blurMaterial===null&&(this._blurMaterial=c0());let n=this._blurMaterial,s=n.uniforms,r=this._sourceTarget;s.sigma.value=Math.min(t,Math.PI)/Math.SQRT2,s.envMap.value=r.texture,this._renderCube(e,0,n),s.envMap.value=e.texture,this._renderCube(r,0,n)}};function ud(i,e,t){return new $i(i,{minFilter:an,generateMipmaps:e,type:_t,colorSpace:Yt,depthBuffer:t})}function ta(i,e,t){return new dt({name:i,uniforms:e,vertexShader:Ge.cube_vert,fragmentShader:t,side:Rt,blending:oi,depthTest:!1,depthWrite:!1})}function o0(){return ta("PMREMGGXConvolution",{envMap:{value:null},roughness:{value:0},lodBias:{value:0}},`

		#define GGX_SAMPLES ${Nd}u

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float roughness;
		uniform float lodBias;

		#include <common>

		// Van der Corput radical inverse
		float radicalInverse_VdC( uint bits ) {

			bits = ( bits << 16u ) | ( bits >> 16u );
			bits = ( ( bits & 0x55555555u ) << 1u ) | ( ( bits & 0xAAAAAAAAu ) >> 1u );
			bits = ( ( bits & 0x33333333u ) << 2u ) | ( ( bits & 0xCCCCCCCCu ) >> 2u );
			bits = ( ( bits & 0x0F0F0F0Fu ) << 4u ) | ( ( bits & 0xF0F0F0F0u ) >> 4u );
			bits = ( ( bits & 0x00FF00FFu ) << 8u ) | ( ( bits & 0xFF00FF00u ) >> 8u );
			return float( bits ) * 2.3283064365386963e-10; // / 0x100000000

		}

		// Hammersley sequence
		vec2 hammersley( uint i, uint N ) {

			return vec2( float( i ) / float( N ), radicalInverse_VdC( i ) );

		}

		void main() {

			vec3 N = normalize( vWorldDirection );

			// For very low roughness, just sample the environment directly
			if ( roughness < 0.001 ) {

				gl_FragColor = vec4( textureLod( envMap, N, 0.0 ).rgb, 1.0 );
				return;

			}

			float alpha = roughness * roughness;
			float alpha2 = alpha * alpha;

			// Tangent space basis for VNDF sampling
			vec3 up = abs( N.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
			vec3 tangent = normalize( cross( up, N ) );
			vec3 bitangent = cross( N, tangent );

			vec3 prefilteredColor = vec3( 0.0 );
			float totalWeight = 0.0;

			for ( uint i = 0u; i < GGX_SAMPLES; i ++ ) {

				vec2 Xi = hammersley( i, GGX_SAMPLES );

				// With V = N, sample the reflected direction directly.
				float invQ = 1.0 / ( 1.0 - Xi.x + alpha2 * Xi.x );
				float NdotL = ( 1.0 - Xi.x - alpha2 * Xi.x ) * invQ;

				if ( NdotL > 0.0 ) {

					float phi = 2.0 * PI * Xi.y;
					float sinTheta = 2.0 * alpha * sqrt( Xi.x * ( 1.0 - Xi.x ) ) * invQ;
					vec3 L = N * NdotL + ( tangent * cos( phi ) + bitangent * sin( phi ) ) * sinTheta;

					// Match the source mip to the sample's solid angle. The terms
					// independent of the sample are precomputed in lodBias.
					float d = alpha2 * invQ;
					float lod = max( log2( d ) + lodBias, 0.0 );

					// Weight by NdotL for the split-sum approximation
					prefilteredColor += textureLod( envMap, L, lod ).rgb * NdotL;
					totalWeight += NdotL;

				}

			}

			gl_FragColor = vec4( prefilteredColor / totalWeight, 1.0 );

		}
	`)}function l0(){return ta("PMREMGGXIntegration",{envMap:{value:null},roughness:{value:0},sourceLod:{value:0},sourceSize:{value:Ld}},`

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float roughness;
		uniform float sourceLod;
		uniform int sourceSize;

		void main() {

			vec3 N = normalize( vWorldDirection );

			float alpha = roughness * roughness;
			float alpha2 = alpha * alpha;

			float texelSize = 2.0 / float( sourceSize );

			vec3 prefilteredColor = vec3( 0.0 );
			float totalWeight = 0.0;

			// Pair opposite texels: only the one in N's hemisphere contributes.
			for ( int face = 0; face < 3; face ++ ) {

				for ( int y = 0; y < sourceSize; y ++ ) {

					for ( int x = 0; x < sourceSize; x ++ ) {

						vec2 uv = ( vec2( x, y ) + 0.5 ) * texelSize - 1.0;
						vec3 texelDirection = face == 0 ? vec3( 1.0, uv ) : ( face == 1 ? vec3( uv.x, 1.0, uv.y ) : vec3( uv, 1.0 ) );

						float invDistance = inversesqrt( 1.0 + dot( uv, uv ) );
						float NdotL = dot( N, texelDirection );
						texelDirection *= NdotL < 0.0 ? - 1.0 : 1.0;
						NdotL = abs( NdotL ) * invDistance;

						// With V = N, NdotH squared is ( 1 + NdotL ) / 2. Common factors
						// in the GGX distribution and texel solid angle cancel when normalized.
						float d = 1.0 + alpha2 + ( alpha2 - 1.0 ) * NdotL;
						float weight = NdotL * invDistance * invDistance * invDistance / ( d * d );

						prefilteredColor += textureLod( envMap, texelDirection, sourceLod ).rgb * weight;
						totalWeight += weight;

					}

				}

			}

			gl_FragColor = vec4( prefilteredColor / totalWeight, 1.0 );

		}
	`)}function c0(){return ta("PMREMSphericalGaussianBlur",{envMap:{value:null},sigma:{value:0}},`

		#define SAMPLES ${i0}
		#define GOLDEN_ANGLE 2.39996322973

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float sigma;

		#include <common>

		void main() {

			vec3 outputDirection = normalize( vWorldDirection );

			vec3 up = abs( outputDirection.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
			vec3 tangent = normalize( cross( up, outputDirection ) );
			vec3 bitangent = cross( outputDirection, tangent );

			// Truncate the kernel at three standard deviations or at the antipode.
			float thetaMax = min( 3.0 * sigma, PI );
			float truncation = 1.0 - exp( - 0.5 * thetaMax * thetaMax / ( sigma * sigma ) );

			vec3 accumColor = vec3( 0.0 );
			float accumWeight = 0.0;

			for ( int i = 0; i < SAMPLES; i ++ ) {

				// Stratified inverse-CDF sampling of the Gaussian, placed on a golden-angle spiral.
				float stratum = ( float( i ) + 0.5 ) / float( SAMPLES );
				float theta = sigma * sqrt( - 2.0 * log( 1.0 - stratum * truncation ) );
				float phi = float( i ) * GOLDEN_ANGLE;

				vec3 offset = cos( phi ) * tangent + sin( phi ) * bitangent;
				vec3 sampleDirection = cos( theta ) * outputDirection + sin( theta ) * offset;

				// Correct the planar sample density to solid angle.
				float weight = sin( theta ) / theta;

				accumColor += weight * textureLod( envMap, sampleDirection, 0.0 ).rgb;
				accumWeight += weight;

			}

			gl_FragColor = vec4( accumColor / accumWeight, 1.0 );

		}
	`)}function hd(){return ta("PMREMEquirectangularToCubemap",{envMap:{value:null}},`

		varying vec3 vWorldDirection;

		uniform sampler2D envMap;

		#include <common>

		void main() {

			// Average four subpixel samples to preserve small, bright features.
			vec3 direction = normalize( vWorldDirection );
			vec3 dx = dFdx( direction ) * 0.25;
			vec3 dy = dFdy( direction ) * 0.25;

			vec3 color = textureLod( envMap, equirectUv( normalize( direction - dx - dy ) ), 0.0 ).rgb;
			color += textureLod( envMap, equirectUv( normalize( direction + dx - dy ) ), 0.0 ).rgb;
			color += textureLod( envMap, equirectUv( normalize( direction - dx + dy ) ), 0.0 ).rgb;
			color += textureLod( envMap, equirectUv( normalize( direction + dx + dy ) ), 0.0 ).rgb;
			gl_FragColor = vec4( color * 0.25, 1.0 );

		}
	`)}function dd(){return ta("PMREMCubemapToCubemap",{envMap:{value:null},flipEnvMap:{value:-1}},`

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float flipEnvMap;

		void main() {

			gl_FragColor = vec4( textureCube( envMap, vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) ).rgb, 1.0 );

		}
	`)}function u0(i){let e=new WeakMap,t=new WeakMap,n=null;function s(d,f=!1){return d==null?null:f?a(d):r(d)}function r(d){if(d&&d.isTexture){let f=d.mapping;if(f===fo||f===po)if(e.has(d)){let g=e.get(d).texture;return o(g,d.mapping)}else{let g=d.image;if(g&&g.height>0){let _=new $i(g.height);return _.fromEquirectangularTexture(i,d),e.set(d,_),d.addEventListener("dispose",c),o(_.texture,d.mapping)}else return null}}return d}function a(d){if(d&&d.isTexture&&d.isPMREMTexture!==!0){let f=d.mapping,g=f===fo||f===po,_=f===ji||f===ks;if(g||_){let m=t.get(d),p=m!==void 0?m.texture.pmremVersion:0;if(d.isRenderTargetTexture&&d.pmremVersion!==p)return n===null&&(n=new Xs(i)),m=g?n.fromEquirectangular(d,m):n.fromCubemap(d,m),m.texture.pmremVersion=d.pmremVersion,t.set(d,m),m.texture;if(m!==void 0)return m.texture;{let y=d.image;return g&&y&&y.height>0||_&&y&&l(y)?(n===null&&(n=new Xs(i)),m=g?n.fromEquirectangular(d):n.fromCubemap(d),m.texture.pmremVersion=d.pmremVersion,t.set(d,m),d.addEventListener("dispose",u),m.texture):null}}}return d}function o(d,f){return f===fo?d.mapping=ji:f===po&&(d.mapping=ks),d}function l(d){let f=0,g=6;for(let _=0;_<g;_++)d[_]!==void 0&&f++;return f===g}function c(d){let f=d.target;f.removeEventListener("dispose",c);let g=e.get(f);g!==void 0&&(e.delete(f),g.dispose())}function u(d){let f=d.target;f.removeEventListener("dispose",u);let g=t.get(f);g!==void 0&&(t.delete(f),g.dispose())}function h(){e=new WeakMap,t=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:s,dispose:h}}function h0(i){let e={};function t(n){if(e[n]!==void 0)return e[n];let s=i.getExtension(n);return e[n]=s,s}return{has:function(n){return t(n)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(n){let s=t(n);return s===null&&Di("WebGLRenderer: "+n+" extension not supported."),s}}}function d0(i,e,t,n){let s={},r=new WeakMap,a=new FinalizationRegistry(g=>delete s[g]);function o(g){l(g.target)}function l(g){g.index!==null&&e.remove(g.index);for(let m in g.attributes)e.remove(g.attributes[m]);g.removeEventListener("dispose",o),delete s[g.id],a.unregister(g);let _=r.get(g);_&&(e.remove(_),r.delete(g)),n.releaseStatesOfGeometry(g),g.isInstancedBufferGeometry===!0&&delete g._maxInstanceCount,t.memory.geometries--}function c(g,_){return s[_.id]!==void 0||(_.addEventListener("dispose",o),s[_.id]=new WeakRef(_),a.register(_,_.id,_),t.memory.geometries++),_}function u(g){let _=g.attributes;for(let m in _)e.update(_[m],i.ARRAY_BUFFER)}function h(g){let _=g.index,m=g.attributes.position,p=0;if(m===void 0)return;let y=_!==null?_.array.length:m.array.length/3-1,w=m.count>=65535?yr:xr,M=new w(Math.ceil(y/3)*6,1),b=M.array;if(_!==null){let x=_.array;p=_.version;for(let T=0,N=0;T<y;T+=3){let C=x[T+0],P=x[T+1],F=x[T+2];b[N++]=C,b[N++]=P,b[N++]=P,b[N++]=F,b[N++]=F,b[N++]=C}}else{p=m.version;for(let x=0,T=0;x<y;x+=3){let N=x+0,C=x+1,P=x+2;b[T++]=N,b[T++]=C,b[T++]=C,b[T++]=P,b[T++]=P,b[T++]=N}}M.version=p;let E=r.get(g);E&&e.remove(E),r.set(g,M)}function d(g){let _=r.get(g);if(_){let m=g.index;m!==null&&_.version<m.version&&h(g)}else h(g);return r.get(g)}function f(){for(let g in s){let _=s[g].deref();_!==void 0&&l(_)}}return{get:c,update:u,getWireframeAttribute:d,dispose:f}}function f0(i,e,t){let n;function s(h){n=h}let r,a;function o(h){r=h.type,a=h.bytesPerElement}function l(h,d){i.drawElements(n,d,r,h*a),t.update(d,n,1)}function c(h,d,f){f!==0&&(i.drawElementsInstanced(n,d,r,h*a,f),t.update(d,n,f))}function u(h,d,f){if(f===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,d,0,r,h,0,f);let _=0;for(let m=0;m<f;m++)_+=d[m];t.update(_,n,1)}this.setMode=s,this.setIndex=o,this.render=l,this.renderInstances=c,this.renderMultiDraw=u}function p0(i){let e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,a,o){switch(t.calls++,a){case i.TRIANGLES:t.triangles+=o*(r/3);break;case i.LINES:t.lines+=o*(r/2);break;case i.LINE_STRIP:t.lines+=o*(r-1);break;case i.LINE_LOOP:t.lines+=o*r;break;case i.POINTS:t.points+=o*r;break;default:Ne("WebGLInfo: Unknown draw mode:",a);break}}function s(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:s,update:n}}function m0(i,e,t){let n=new WeakMap,s=new Ye;function r(a,o,l){let c=a.morphTargetInfluences,u=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,h=u!==void 0?u.length:0,d=n.get(o);if(d===void 0||d.count!==h){let N=function(){x.dispose(),n.delete(o),o.removeEventListener("dispose",N)};d!==void 0&&d.texture.dispose();let f=o.morphAttributes.position!==void 0,g=o.morphAttributes.normal!==void 0,_=o.morphAttributes.color!==void 0,m=o.morphAttributes.position||[],p=o.morphAttributes.normal||[],y=o.morphAttributes.color||[],w=0;f===!0&&(w=1),g===!0&&(w=2),_===!0&&(w=3);let M=o.attributes.position.count*w,b=1;M>e.maxTextureSize&&(b=Math.ceil(M/e.maxTextureSize),M=e.maxTextureSize);let E=new Float32Array(M*b*4*h),x=new gr(E,M,b,h);x.type=fn,x.needsUpdate=!0;let T=w*4;for(let C=0;C<h;C++){let P=m[C],F=p[C],G=y[C],A=M*b*4*C;for(let U=0;U<P.count;U++){let B=U*T;f===!0&&(s.fromBufferAttribute(P,U),E[A+B+0]=s.x,E[A+B+1]=s.y,E[A+B+2]=s.z,E[A+B+3]=0),g===!0&&(s.fromBufferAttribute(F,U),E[A+B+4]=s.x,E[A+B+5]=s.y,E[A+B+6]=s.z,E[A+B+7]=0),_===!0&&(s.fromBufferAttribute(G,U),E[A+B+8]=s.x,E[A+B+9]=s.y,E[A+B+10]=s.z,E[A+B+11]=G.itemSize===4?s.w:1)}}d={count:h,texture:x,size:new Ee(M,b)},n.set(o,d),o.addEventListener("dispose",N)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)l.getUniforms().setValue(i,"morphTexture",a.morphTexture,t);else{let f=0;for(let _=0;_<c.length;_++)f+=c[_];let g=o.morphTargetsRelative?1:1-f;l.getUniforms().setValue(i,"morphTargetBaseInfluence",g),l.getUniforms().setValue(i,"morphTargetInfluences",c)}l.getUniforms().setValue(i,"morphTargetsTexture",d.texture,t),l.getUniforms().setValue(i,"morphTargetsTextureSize",d.size)}return{update:r}}function g0(i,e,t,n,s){let r=new WeakMap;function a(c){let u=s.render.frame,h=c.geometry,d=e.get(c,h);if(r.get(d)!==u&&(e.update(d),r.set(d,u)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),r.get(c)!==u&&(t.update(c.instanceMatrix,i.ARRAY_BUFFER),c.instanceColor!==null&&t.update(c.instanceColor,i.ARRAY_BUFFER),r.set(c,u))),c.isSkinnedMesh){let f=c.skeleton;r.get(f)!==u&&(f.update(),r.set(f,u))}return d}function o(){r=new WeakMap}function l(c){let u=c.target;u.removeEventListener("dispose",l),n.releaseStatesOfObject(u),t.remove(u.instanceMatrix),u.instanceColor!==null&&t.remove(u.instanceColor)}return{update:a,dispose:o}}var x0={[kr]:"LINEAR_TONE_MAPPING",[zr]:"REINHARD_TONE_MAPPING",[Gr]:"CINEON_TONE_MAPPING",[Ki]:"ACES_FILMIC_TONE_MAPPING",[Wr]:"AGX_TONE_MAPPING",[qr]:"NEUTRAL_TONE_MAPPING",[Hr]:"CUSTOM_TONE_MAPPING"};function y0(i,e,t,n,s,r){let a=new mt(e,t,{type:i,depthBuffer:s,stencilBuffer:r,samples:n?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1}),o=null,l=null,c=null,u=new gt;u.setAttribute("position",new $e([-1,3,0,-1,-1,0,3,-1,0],3)),u.setAttribute("uv",new $e([0,2,0,0,2,0],2));let h=new Us({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),d=new je(u,h),f=new ri(-1,1,1,-1,0,1),g=null,_=null,m=!1,p,y=null,w=[],M=!1;this.setSize=function(b,E){a.setSize(b,E),o!==null&&o.setSize(b,E),l!==null&&l.setSize(b,E);for(let x=0;x<w.length;x++){let T=w[x];T.setSize&&T.setSize(b,E)}},this.setEffects=function(b){w=b,M=w.length>0&&w[0].isRenderPass===!0;let E=a.width,x=a.height;w.length>0&&o===null&&(o=new mt(E,x,{type:_t,depthBuffer:!1,stencilBuffer:!1}),l=new mt(E,x,{type:_t,depthBuffer:!1,stencilBuffer:!1}));let T=s===!0&&w.some(N=>N.needsDepthTexture===!0);T!==(a.depthTexture!==null)&&(T===!0&&c===null&&(c=new ei(E,x),r===!0&&(c.format=li,c.type=Yi)),a.dispose(),a.depthTexture=T?c:null,a.resolveDepthBuffer=T,a.storeMultisampledDepthBuffer=T);for(let N=0;N<w.length;N++){let C=w[N];C.setSize&&C.setSize(E,x),T&&C.needsDepthTexture===!0&&C.setDepthTexture&&C.setDepthTexture(c)}},this.begin=function(b,E){if(m||b.toneMapping===Fn&&w.length===0)return!1;if(y=E,E!==null){let x=E.width,T=E.height;(a.width!==x||a.height!==T)&&this.setSize(x,T)}return M===!1&&b.setRenderTarget(a),p=b.toneMapping,b.toneMapping=Fn,!0},this.hasRenderPass=function(){return M},this.end=function(b,E){b.toneMapping=p,m=!0;let x=a,T=o;for(let N=0;N<w.length;N++){let C=w[N];C.enabled!==!1&&(C.render(b,T,x,E),C.needsSwap!==!1&&(x=T,T=T===o?l:o))}if(g!==b.outputColorSpace||_!==b.toneMapping){g=b.outputColorSpace,_=b.toneMapping,h.defines={},Ve.getTransfer(g)===Je&&(h.defines.SRGB_TRANSFER="");let N=x0[_];N&&(h.defines[N]=""),h.needsUpdate=!0}h.uniforms.tDiffuse.value=x.texture,b.setRenderTarget(y),b.render(d,f),y=null,m=!1},this.isCompositing=function(){return m},this.dispose=function(){a.dispose(),o!==null&&o.dispose(),l!==null&&l.dispose(),u.dispose(),h.dispose()}}var Ud=new Dt,Dd=new ei(1,1),Od=new Er(1),Fd=new gr,Bd=new ws,Vd=new wr,fd=[],pd=[],md=new Float32Array(16),gd=new Float32Array(9),xd=new Float32Array(4);function Ks(i,e,t){let n=i[0];if(n<=0||n>0)return i;let s=e*t,r=fd[s];if(r===void 0&&(r=new Float32Array(s),fd[s]=r),e!==0){n.toArray(r,0);for(let a=1,o=0;a!==e;++a)o+=t,i[a].toArray(r,o)}return r}function Ct(i,e){if(i.length!==e.length)return!1;for(let t=0,n=i.length;t<n;t++)if(i[t]!==e[t])return!1;return!0}function It(i,e){for(let t=0,n=e.length;t<n;t++)i[t]=e[t]}function il(i,e){let t=pd[e];t===void 0&&(t=new Int32Array(e),pd[e]=t);for(let n=0;n!==e;++n)t[n]=i.allocateTextureUnit();return t}function v0(i,e){let t=this.cache;t[0]!==e&&(i.uniform1f(this.addr,e),t[0]=e)}function _0(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Ct(t,e))return;i.uniform2fv(this.addr,e),It(t,e)}}function S0(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(i.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(Ct(t,e))return;i.uniform3fv(this.addr,e),It(t,e)}}function M0(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Ct(t,e))return;i.uniform4fv(this.addr,e),It(t,e)}}function b0(i,e){let t=this.cache,n=e.elements;if(n===void 0){if(Ct(t,e))return;i.uniformMatrix2fv(this.addr,!1,e),It(t,e)}else{if(Ct(t,n))return;xd.set(n),i.uniformMatrix2fv(this.addr,!1,xd),It(t,n)}}function T0(i,e){let t=this.cache,n=e.elements;if(n===void 0){if(Ct(t,e))return;i.uniformMatrix3fv(this.addr,!1,e),It(t,e)}else{if(Ct(t,n))return;gd.set(n),i.uniformMatrix3fv(this.addr,!1,gd),It(t,n)}}function w0(i,e){let t=this.cache,n=e.elements;if(n===void 0){if(Ct(t,e))return;i.uniformMatrix4fv(this.addr,!1,e),It(t,e)}else{if(Ct(t,n))return;md.set(n),i.uniformMatrix4fv(this.addr,!1,md),It(t,n)}}function E0(i,e){let t=this.cache;t[0]!==e&&(i.uniform1i(this.addr,e),t[0]=e)}function A0(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Ct(t,e))return;i.uniform2iv(this.addr,e),It(t,e)}}function R0(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Ct(t,e))return;i.uniform3iv(this.addr,e),It(t,e)}}function C0(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Ct(t,e))return;i.uniform4iv(this.addr,e),It(t,e)}}function I0(i,e){let t=this.cache;t[0]!==e&&(i.uniform1ui(this.addr,e),t[0]=e)}function P0(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Ct(t,e))return;i.uniform2uiv(this.addr,e),It(t,e)}}function N0(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Ct(t,e))return;i.uniform3uiv(this.addr,e),It(t,e)}}function L0(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Ct(t,e))return;i.uniform4uiv(this.addr,e),It(t,e)}}function sl(i){return i.version===0&&(i.compareFunction=vc,i.needsUpdate=!0),i}function U0(i,e,t){let n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_2D_SHADOW?r=sl(Dd):r=Ud,t.setTexture2D(e||r,s)}function D0(i,e,t){let n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture3D(e||Bd,s)}function O0(i,e,t){let n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_CUBE_SHADOW?r=sl(Od):r=Vd,t.setTextureCube(e||r,s)}function F0(i,e,t){let n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture2DArray(e||Fd,s)}function B0(i){switch(i){case 5126:return v0;case 35664:return _0;case 35665:return S0;case 35666:return M0;case 35674:return b0;case 35675:return T0;case 35676:return w0;case 5124:case 35670:return E0;case 35667:case 35671:return A0;case 35668:case 35672:return R0;case 35669:case 35673:return C0;case 5125:return I0;case 36294:return P0;case 36295:return N0;case 36296:return L0;case 35678:case 36198:case 36298:case 36306:case 35682:return U0;case 35679:case 36299:case 36307:return D0;case 35680:case 36300:case 36308:case 36293:return O0;case 36289:case 36303:case 36311:case 36292:return F0}}function V0(i,e){i.uniform1fv(this.addr,e)}function k0(i,e){let t=Ks(e,this.size,2);i.uniform2fv(this.addr,t)}function z0(i,e){let t=Ks(e,this.size,3);i.uniform3fv(this.addr,t)}function G0(i,e){let t=Ks(e,this.size,4);i.uniform4fv(this.addr,t)}function H0(i,e){let t=Ks(e,this.size,4);i.uniformMatrix2fv(this.addr,!1,t)}function W0(i,e){let t=Ks(e,this.size,9);i.uniformMatrix3fv(this.addr,!1,t)}function q0(i,e){let t=Ks(e,this.size,16);i.uniformMatrix4fv(this.addr,!1,t)}function X0(i,e){i.uniform1iv(this.addr,e)}function K0(i,e){i.uniform2iv(this.addr,e)}function j0(i,e){i.uniform3iv(this.addr,e)}function Z0(i,e){i.uniform4iv(this.addr,e)}function Y0(i,e){i.uniform1uiv(this.addr,e)}function J0(i,e){i.uniform2uiv(this.addr,e)}function Q0(i,e){i.uniform3uiv(this.addr,e)}function $0(i,e){i.uniform4uiv(this.addr,e)}function ex(i,e,t){let n=this.cache,s=e.length,r=il(t,s);Ct(n,r)||(i.uniform1iv(this.addr,r),It(n,r));let a;this.type===i.SAMPLER_2D_SHADOW?a=sl(Dd):a=Ud;for(let o=0;o!==s;++o)t.setTexture2D(e[o]||a,r[o])}function tx(i,e,t){let n=this.cache,s=e.length,r=il(t,s);Ct(n,r)||(i.uniform1iv(this.addr,r),It(n,r));for(let a=0;a!==s;++a)t.setTexture3D(e[a]||Bd,r[a])}function nx(i,e,t){let n=this.cache,s=e.length,r=il(t,s);Ct(n,r)||(i.uniform1iv(this.addr,r),It(n,r));let a;this.type===i.SAMPLER_CUBE_SHADOW?a=sl(Od):a=Vd;for(let o=0;o!==s;++o)t.setTextureCube(e[o]||a,r[o])}function ix(i,e,t){let n=this.cache,s=e.length,r=il(t,s);Ct(n,r)||(i.uniform1iv(this.addr,r),It(n,r));for(let a=0;a!==s;++a)t.setTexture2DArray(e[a]||Fd,r[a])}function sx(i){switch(i){case 5126:return V0;case 35664:return k0;case 35665:return z0;case 35666:return G0;case 35674:return H0;case 35675:return W0;case 35676:return q0;case 5124:case 35670:return X0;case 35667:case 35671:return K0;case 35668:case 35672:return j0;case 35669:case 35673:return Z0;case 5125:return Y0;case 36294:return J0;case 36295:return Q0;case 36296:return $0;case 35678:case 36198:case 36298:case 36306:case 35682:return ex;case 35679:case 36299:case 36307:return tx;case 35680:case 36300:case 36308:case 36293:return nx;case 36289:case 36303:case 36311:case 36292:return ix}}var Nc=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=B0(t.type)}},Lc=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=sx(t.type)}},Uc=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let s=this.seq;for(let r=0,a=s.length;r!==a;++r){let o=s[r];o.setValue(e,t[o.id],n)}}},Ic=/(\w+)(\])?(\[|\.)?/g;function yd(i,e){i.seq.push(e),i.map[e.id]=e}function rx(i,e,t){let n=i.name,s=n.length;for(Ic.lastIndex=0;;){let r=Ic.exec(n),a=Ic.lastIndex,o=r[1],l=r[2]==="]",c=r[3];if(l&&(o=o|0),c===void 0||c==="["&&a+2===s){yd(t,c===void 0?new Nc(o,i,e):new Lc(o,i,e));break}else{let h=t.map[o];h===void 0&&(h=new Uc(o),yd(t,h)),t=h}}}var qs=class{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let a=0;a<n;++a){let o=e.getActiveUniform(t,a),l=e.getUniformLocation(t,o.name);rx(o,l,this)}let s=[],r=[];for(let a of this.seq)a.type===e.SAMPLER_2D_SHADOW||a.type===e.SAMPLER_CUBE_SHADOW||a.type===e.SAMPLER_2D_ARRAY_SHADOW?s.push(a):r.push(a);s.length>0&&(this.seq=s.concat(r))}setValue(e,t,n,s){let r=this.map[t];r!==void 0&&r.setValue(e,n,s)}setOptional(e,t,n){let s=t[n];s!==void 0&&this.setValue(e,n,s)}static upload(e,t,n,s){for(let r=0,a=t.length;r!==a;++r){let o=t[r],l=n[o.id];l.needsUpdate!==!1&&o.setValue(e,l.value,s)}}static seqWithValue(e,t){let n=[];for(let s=0,r=e.length;s!==r;++s){let a=e[s];a.id in t&&n.push(a)}return n}};function vd(i,e,t){let n=i.createShader(e);return i.shaderSource(n,t),i.compileShader(n),n}var ax=37297,ox=0;function lx(i,e){let t=i.split(`
`),n=[],s=Math.max(e-6,0),r=Math.min(e+6,t.length);for(let a=s;a<r;a++){let o=a+1;n.push(`${o===e?">":" "} ${o}: ${t[a]}`)}return n.join(`
`)}var _d=new Ue;function cx(i){Ve._getMatrix(_d,Ve.workingColorSpace,i);let e=`mat3( ${_d.elements.map(t=>t.toFixed(4))} )`;switch(Ve.getTransfer(i)){case pr:return[e,"LinearTransferOETF"];case Je:return[e,"sRGBTransferOETF"];default:return be("WebGLProgram: Unsupported color space: ",i),[e,"LinearTransferOETF"]}}function Sd(i,e,t){let n=i.getShaderParameter(e,i.COMPILE_STATUS),r=(i.getShaderInfoLog(e)||"").trim();if(n&&r==="")return"";let a=/ERROR: 0:(\d+)/.exec(r);if(a){let o=parseInt(a[1]);return t.toUpperCase()+`

`+r+`

`+lx(i.getShaderSource(e),o)}else return r}function ux(i,e){let t=cx(e);return[`vec4 ${i}( vec4 value ) {`,`	return ${t[1]}( vec4( ${t[0]} * value.rgb, value.a ) );`,"}"].join(`
`)}var hx={[kr]:"Linear",[zr]:"Reinhard",[Gr]:"Cineon",[Ki]:"ACESFilmic",[Wr]:"AgX",[qr]:"Neutral",[Hr]:"Custom"};function dx(i,e){let t=hx[e];return t===void 0?(be("WebGLProgram: Unsupported toneMapping:",e),"vec3 "+i+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+i+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}var tl=new D;function fx(){Ve.getLuminanceCoefficients(tl);let i=tl.x.toFixed(4),e=tl.y.toFixed(4),t=tl.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function px(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(ea).join(`
`)}function mx(i){let e=[];for(let t in i){let n=i[t];n!==!1&&e.push("#define "+t+" "+n)}return e.join(`
`)}function gx(i,e){let t={},n=i.getProgramParameter(e,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){let r=i.getActiveAttrib(e,s),a=r.name,o=1;r.type===i.FLOAT_MAT2&&(o=2),r.type===i.FLOAT_MAT3&&(o=3),r.type===i.FLOAT_MAT4&&(o=4),t[a]={type:r.type,location:i.getAttribLocation(e,a),locationSize:o}}return t}function ea(i){return i!==""}function Md(i,e){let t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return i.replace(/NUM_SUN_LIGHTS/g,e.numSunLights).replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,e.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows).replace(/NUM_LIGHT_PROBE_GRIDS/g,e.numLightProbeGrids)}function bd(i,e){return i.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}var xx=/^[ \t]*#include +<([\w\d./]+)>/gm;function Dc(i){return i.replace(xx,yx)}function yx(i,e){let t=Ge[e];if(t===void 0)throw new Error("THREE.WebGLProgram: Can not resolve #include <"+e+">");return Dc(t)}var vx=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Td(i){return i.replace(vx,_x)}function _x(i,e,t,n){let s="";for(let r=parseInt(e);r<parseInt(t);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function wd(i){let e=`precision ${i.precision} float;
	precision ${i.precision} int;
	precision ${i.precision} sampler2D;
	precision ${i.precision} samplerCube;
	precision ${i.precision} sampler3D;
	precision ${i.precision} sampler2DArray;
	precision ${i.precision} sampler2DShadow;
	precision ${i.precision} samplerCubeShadow;
	precision ${i.precision} sampler2DArrayShadow;
	precision ${i.precision} isampler2D;
	precision ${i.precision} isampler3D;
	precision ${i.precision} isamplerCube;
	precision ${i.precision} isampler2DArray;
	precision ${i.precision} usampler2D;
	precision ${i.precision} usampler3D;
	precision ${i.precision} usamplerCube;
	precision ${i.precision} usampler2DArray;
	`;return i.precision==="highp"?e+=`
#define HIGH_PRECISION`:i.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:i.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}var Sx={[Wi]:"SHADOWMAP_TYPE_PCF",[Bs]:"SHADOWMAP_TYPE_VSM"};function Mx(i){return Sx[i.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}var bx={[ks]:"ENVMAP_MODE_REFRACTION"};function Tx(i){return i.envMap===!1?"ENVMAP_MODE_REFLECTION":bx[i.envMapMode]||"ENVMAP_MODE_REFLECTION"}var wx={[lc]:"ENVMAP_BLENDING_MULTIPLY",[Wh]:"ENVMAP_BLENDING_MIX",[qh]:"ENVMAP_BLENDING_ADD"};function Ex(i){return i.envMap===!1?"ENVMAP_BLENDING_NONE":wx[i.combine]||"ENVMAP_BLENDING_NONE"}function Ax(i,e,t,n){let s=i.getContext(),r=t.defines,a=t.vertexShader,o=t.fragmentShader,l=Mx(t),c=t.envMapPMREM===!0?"ENVMAP_TYPE_PMREM":"ENVMAP_TYPE_CUBE",u=Tx(t),h=Ex(t),d=px(t),f=mx(r),g=s.createProgram(),_,m,p=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(_=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,f].filter(ea).join(`
`),_.length>0&&(_+=`
`),m=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,f].filter(ea).join(`
`),m.length>0&&(m+=`
`)):(_=[wd(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,f,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+u:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.diffuseRoughnessMap?"#define USE_DIFFUSE_ROUGHNESSMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.diffuseRoughnessMapUv?"#define DIFFUSE_ROUGHNESSMAP_UV "+t.diffuseRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexNormals?"#define HAS_NORMAL":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(ea).join(`
`),m=[wd(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,f,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+c:"",t.envMap?"#define "+u:"",t.envMap?"#define "+h:"",t.envMapPMREM?"#define ENVMAP_MAX_LOD "+t.envMapMaxLod+".0":"",t.envMapPMREM?"#define ENVMAP_SIZE "+t.envMapSize+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.diffuseRoughness?"#define USE_DIFFUSE_ROUGHNESS":"",t.diffuseRoughnessMap?"#define USE_DIFFUSE_ROUGHNESSMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.retroreflection?"#define USE_RETROREFLECTION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas||t.batchingColor?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==Fn?"#define TONE_MAPPING":"",t.toneMapping!==Fn?Ge.tonemapping_pars_fragment:"",t.toneMapping!==Fn?dx("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",Ge.colorspace_pars_fragment,ux("linearToOutputTexel",t.outputColorSpace),fx(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(ea).join(`
`)),a=Dc(a),a=Md(a,t),a=bd(a,t),o=Dc(o),o=Md(o,t),o=bd(o,t),a=Td(a),o=Td(o),t.isRawShaderMaterial!==!0&&(p=`#version 300 es
`,_=[d,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+_,m=["#define varying in",t.glslVersion===Sc?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===Sc?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+m);let y=p+_+a,w=p+m+o,M=vd(s,s.VERTEX_SHADER,y),b=vd(s,s.FRAGMENT_SHADER,w);s.attachShader(g,M),s.attachShader(g,b),t.index0AttributeName!==void 0?s.bindAttribLocation(g,0,t.index0AttributeName):t.hasPositionAttribute===!0&&s.bindAttribLocation(g,0,"position"),s.linkProgram(g);function E(C){if(i.debug.checkShaderErrors){let P=s.getProgramInfoLog(g)||"",F=s.getShaderInfoLog(M)||"",G=s.getShaderInfoLog(b)||"",A=P.trim(),U=F.trim(),B=G.trim(),V=!0,$=!0;if(s.getProgramParameter(g,s.LINK_STATUS)===!1)if(V=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,g,M,b);else{let q=Sd(s,M,"vertex"),Q=Sd(s,b,"fragment");Ne("WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(g,s.VALIDATE_STATUS)+`

Material Name: `+C.name+`
Material Type: `+C.type+`

Program Info Log: `+A+`
`+q+`
`+Q)}else A!==""?be("WebGLProgram: Program Info Log:",A):(U===""||B==="")&&($=!1);$&&(C.diagnostics={runnable:V,programLog:A,vertexShader:{log:U,prefix:_},fragmentShader:{log:B,prefix:m}})}s.deleteShader(M),s.deleteShader(b),x=new qs(s,g),T=gx(s,g)}let x;this.getUniforms=function(){return x===void 0&&E(this),x};let T;this.getAttributes=function(){return T===void 0&&E(this),T};let N=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return N===!1&&(N=s.getProgramParameter(g,ax)),N},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(g),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=ox++,this.cacheKey=e,this.usedTimes=1,this.program=g,this.vertexShader=M,this.fragmentShader=b,this}var Rx=0,Oc=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,n){let s=this._getShaderCacheForMaterial(e);return s.has(t)===!1&&(s.add(t),t.usedTimes++),s.has(n)===!1&&(s.add(n),n.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let n of t)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);return n===void 0&&(n=new Fc(e),t.set(e,n)),n}},Fc=class{constructor(e){this.id=Rx++,this.code=e,this.usedTimes=0}};function Cx(i){return i===wi||i===Yr||i===Jr}function Ix(i,e,t,n,s,r){let a=new Es,o=new Oc,l=new Set,c=[],u=new Map,h=n.logarithmicDepthBuffer,d={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function f(x){return l.add(x),x===0?"uv":`uv${x}`}function g(x,T,N,C,P,F){let G=C.fog,A=P.geometry,U=x.isMeshStandardMaterial||x.isMeshLambertMaterial||x.isMeshPhongMaterial?C.environment:null,B=x.isMeshStandardMaterial||x.isMeshLambertMaterial&&!x.envMap||x.isMeshPhongMaterial&&!x.envMap,V=e.get(x.envMap||U,B),$=d[x.type],q=n.precision;x.precision!==null&&(q=n.getMaxPrecision(x.precision),q!==x.precision&&be("WebGLProgram.getParameters:",x.precision,"not supported, using",q,"instead."));let Q=A.morphAttributes.position||A.morphAttributes.normal||A.morphAttributes.color,ee=Q!==void 0?Q.length:0,ve=0;A.morphAttributes.position!==void 0&&(ve=1),A.morphAttributes.normal!==void 0&&(ve=2),A.morphAttributes.color!==void 0&&(ve=3);let Ie,j,ce,xe;if($){let pe=kn[$];Ie=pe.vertexShader,j=pe.fragmentShader}else{Ie=x.vertexShader,j=x.fragmentShader;let pe=o.getVertexShaderStage(x),tt=o.getFragmentShaderStage(x);o.update(x,pe,tt),ce=pe.id,xe=tt.id}let Re=i.getRenderTarget(),fe=i.state.buffers.depth.getReversed(),De=P.isInstancedMesh===!0,St=P.isBatchedMesh===!0,Pe=!!x.map,et=!!x.matcap,nt=!!V,qe=nt&&V.isPMREMTexture===!0,Ot=!!x.aoMap,wt=!!x.lightMap,$t=!!x.bumpMap&&x.wireframe===!1,lt=!!x.normalMap,Pn=!!x.displacementMap,Pt=!!x.emissiveMap,mn=!!x.metalnessMap,gn=!!x.roughnessMap,xn=x.anisotropy>0,O=x.clearcoat>0,yn=x.diffuseRoughness>0,at=x.dispersion>0,ot=x.retroreflectivity>0,de=x.iridescence>0,Et=x.sheen>0,Ce=x.transmission>0,Oe=xn&&!!x.anisotropyMap,R=O&&!!x.clearcoatMap,v=O&&!!x.clearcoatNormalMap,z=O&&!!x.clearcoatRoughnessMap,te=yn&&!!x.diffuseRoughnessMap,J=de&&!!x.iridescenceMap,se=de&&!!x.iridescenceThicknessMap,ue=Et&&!!x.sheenColorMap,K=Et&&!!x.sheenRoughnessMap,Z=!!x.specularMap,ae=!!x.specularColorMap,I=!!x.specularIntensityMap,Y=Ce&&!!x.transmissionMap,X=Ce&&!!x.thicknessMap,oe=!!x.gradientMap,ie=!!x.alphaMap,re=x.alphaTest>0,we=!!x.alphaHash,ze=!!x.extensions,ne=Fn;x.toneMapped&&(Re===null||Re.isXRRenderTarget===!0)&&(ne=i.toneMapping);let Ae=qe?V.isCompressedCubeTexture?V.image[0].mipmaps:V.mipmaps:null,Be={shaderID:$,shaderType:x.type,shaderName:x.name,vertexShader:Ie,fragmentShader:j,defines:x.defines,customVertexShaderID:ce,customFragmentShaderID:xe,isRawShaderMaterial:x.isRawShaderMaterial===!0,glslVersion:x.glslVersion,precision:q,batching:St,batchingColor:St&&P._colorsTexture!==null,instancing:De,instancingColor:De&&P.instanceColor!==null,instancingMorph:De&&P.morphTexture!==null,outputColorSpace:Re===null?i.outputColorSpace:Re.isXRRenderTarget===!0?Re.texture.colorSpace:Ve.workingColorSpace,alphaToCoverage:!!x.alphaToCoverage,map:Pe,matcap:et,envMap:nt,envMapMode:nt&&V.mapping,envMapPMREM:qe,envMapMaxLod:qe?Ae.length-1:null,envMapSize:qe?Ae[0].width:null,aoMap:Ot,lightMap:wt,bumpMap:$t,normalMap:lt,displacementMap:Pn,emissiveMap:Pt,normalMapObjectSpace:lt&&x.normalMapType===Zh,normalMapTangentSpace:lt&&x.normalMapType===Qo,packedNormalMap:lt&&x.normalMapType===Qo&&Cx(x.normalMap.format),metalnessMap:mn,roughnessMap:gn,anisotropy:xn,anisotropyMap:Oe,clearcoat:O,clearcoatMap:R,clearcoatNormalMap:v,clearcoatRoughnessMap:z,diffuseRoughness:yn,diffuseRoughnessMap:te,dispersion:at,retroreflection:ot,iridescence:de,iridescenceMap:J,iridescenceThicknessMap:se,sheen:Et,sheenColorMap:ue,sheenRoughnessMap:K,specularMap:Z,specularColorMap:ae,specularIntensityMap:I,transmission:Ce,transmissionMap:Y,thicknessMap:X,gradientMap:oe,opaque:x.transparent===!1&&x.blending===Vs&&x.alphaToCoverage===!1,alphaMap:ie,alphaTest:re,alphaHash:we,combine:x.combine,mapUv:Pe&&f(x.map.channel),aoMapUv:Ot&&f(x.aoMap.channel),lightMapUv:wt&&f(x.lightMap.channel),bumpMapUv:$t&&f(x.bumpMap.channel),normalMapUv:lt&&f(x.normalMap.channel),displacementMapUv:Pn&&f(x.displacementMap.channel),emissiveMapUv:Pt&&f(x.emissiveMap.channel),metalnessMapUv:mn&&f(x.metalnessMap.channel),roughnessMapUv:gn&&f(x.roughnessMap.channel),anisotropyMapUv:Oe&&f(x.anisotropyMap.channel),clearcoatMapUv:R&&f(x.clearcoatMap.channel),clearcoatNormalMapUv:v&&f(x.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:z&&f(x.clearcoatRoughnessMap.channel),diffuseRoughnessMapUv:te&&f(x.diffuseRoughnessMap.channel),iridescenceMapUv:J&&f(x.iridescenceMap.channel),iridescenceThicknessMapUv:se&&f(x.iridescenceThicknessMap.channel),sheenColorMapUv:ue&&f(x.sheenColorMap.channel),sheenRoughnessMapUv:K&&f(x.sheenRoughnessMap.channel),specularMapUv:Z&&f(x.specularMap.channel),specularColorMapUv:ae&&f(x.specularColorMap.channel),specularIntensityMapUv:I&&f(x.specularIntensityMap.channel),transmissionMapUv:Y&&f(x.transmissionMap.channel),thicknessMapUv:X&&f(x.thicknessMap.channel),alphaMapUv:ie&&f(x.alphaMap.channel),vertexTangents:!!A.attributes.tangent&&(lt||xn),vertexNormals:!!A.attributes.normal,vertexColors:x.vertexColors,vertexAlphas:x.vertexColors===!0&&!!A.attributes.color&&A.attributes.color.itemSize===4,pointsUvs:P.isPoints===!0&&!!A.attributes.uv&&(Pe||ie),fog:!!G,useFog:x.fog===!0,fogExp2:!!G&&G.isFogExp2,flatShading:x.wireframe===!1&&(x.flatShading===!0||A.attributes.normal===void 0&&lt===!1&&(x.isMeshLambertMaterial||x.isMeshPhongMaterial||x.isMeshStandardMaterial||x.isMeshPhysicalMaterial)),sizeAttenuation:x.sizeAttenuation===!0,logarithmicDepthBuffer:h,reversedDepthBuffer:fe,skinning:P.isSkinnedMesh===!0,hasPositionAttribute:A.attributes.position!==void 0,morphTargets:A.morphAttributes.position!==void 0,morphNormals:A.morphAttributes.normal!==void 0,morphColors:A.morphAttributes.color!==void 0,morphTargetsCount:ee,morphTextureStride:ve,numSunLights:T.sun.length,numDirLights:T.directional.length,numPointLights:T.point.length,numSpotLights:T.spot.length,numSpotLightMaps:T.spotLightMap.length,numRectAreaLights:T.rectArea.length,numHemiLights:T.hemi.length,numSunLightShadows:T.sunShadowMap.length,numDirLightShadows:T.directionalShadowMap.length,numPointLightShadows:T.pointShadowMap.length,numSpotLightShadows:T.spotShadowMap.length,numSpotLightShadowsWithMaps:T.numSpotLightShadowsWithMaps,numLightProbes:T.numLightProbes,numLightProbeGrids:F.filter(pe=>pe.texture!==null).length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:x.dithering,shadowMapEnabled:i.shadowMap.enabled&&N.length>0,shadowMapType:i.shadowMap.type,toneMapping:ne,decodeVideoTexture:Pe&&x.map.isVideoTexture===!0&&Ve.getTransfer(x.map.colorSpace)===Je,decodeVideoTextureEmissive:Pt&&x.emissiveMap.isVideoTexture===!0&&Ve.getTransfer(x.emissiveMap.colorSpace)===Je,premultipliedAlpha:x.premultipliedAlpha,doubleSided:x.side===Xt,flipSided:x.side===Rt,useDepthPacking:x.depthPacking>=0,depthPacking:x.depthPacking||0,index0AttributeName:x.index0AttributeName,extensionClipCullDistance:ze&&x.extensions.clipCullDistance===!0&&t.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(ze&&x.extensions.multiDraw===!0||St)&&t.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:t.has("KHR_parallel_shader_compile"),customProgramCacheKey:x.customProgramCacheKey()};return Be.vertexUv1s=l.has(1),Be.vertexUv2s=l.has(2),Be.vertexUv3s=l.has(3),l.clear(),Be}function _(x){let T=[];if(x.shaderID?T.push(x.shaderID):(T.push(x.customVertexShaderID),T.push(x.customFragmentShaderID)),x.defines!==void 0)for(let N in x.defines)T.push(N),T.push(x.defines[N]);return x.isRawShaderMaterial===!1&&(m(T,x),p(T,x),T.push(i.outputColorSpace)),T.push(x.customProgramCacheKey),T.join()}function m(x,T){x.push(T.precision),x.push(T.outputColorSpace),x.push(T.envMapMode),x.push(T.envMapPMREM),x.push(T.envMapMaxLod),x.push(T.envMapSize),x.push(T.mapUv),x.push(T.alphaMapUv),x.push(T.lightMapUv),x.push(T.aoMapUv),x.push(T.bumpMapUv),x.push(T.normalMapUv),x.push(T.displacementMapUv),x.push(T.emissiveMapUv),x.push(T.metalnessMapUv),x.push(T.roughnessMapUv),x.push(T.anisotropyMapUv),x.push(T.clearcoatMapUv),x.push(T.clearcoatNormalMapUv),x.push(T.clearcoatRoughnessMapUv),x.push(T.diffuseRoughnessMapUv),x.push(T.iridescenceMapUv),x.push(T.iridescenceThicknessMapUv),x.push(T.sheenColorMapUv),x.push(T.sheenRoughnessMapUv),x.push(T.specularMapUv),x.push(T.specularColorMapUv),x.push(T.specularIntensityMapUv),x.push(T.transmissionMapUv),x.push(T.thicknessMapUv),x.push(T.combine),x.push(T.fogExp2),x.push(T.sizeAttenuation),x.push(T.morphTargetsCount),x.push(T.numSunLights),x.push(T.numDirLights),x.push(T.numPointLights),x.push(T.numSpotLights),x.push(T.numSpotLightMaps),x.push(T.numHemiLights),x.push(T.numRectAreaLights),x.push(T.numSunLightShadows),x.push(T.numDirLightShadows),x.push(T.numPointLightShadows),x.push(T.numSpotLightShadows),x.push(T.numSpotLightShadowsWithMaps),x.push(T.numLightProbes),x.push(T.numLightProbeGrids),x.push(T.shadowMapType),x.push(T.toneMapping),x.push(T.numClippingPlanes),x.push(T.numClipIntersection),x.push(T.depthPacking)}function p(x,T){a.disableAll(),T.instancing&&a.enable(0),T.instancingColor&&a.enable(1),T.instancingMorph&&a.enable(2),T.matcap&&a.enable(3),T.envMap&&a.enable(4),T.normalMapObjectSpace&&a.enable(5),T.normalMapTangentSpace&&a.enable(6),T.clearcoat&&a.enable(7),T.iridescence&&a.enable(8),T.alphaTest&&a.enable(9),T.vertexColors&&a.enable(10),T.vertexAlphas&&a.enable(11),T.vertexUv1s&&a.enable(12),T.vertexUv2s&&a.enable(13),T.vertexUv3s&&a.enable(14),T.vertexTangents&&a.enable(15),T.anisotropy&&a.enable(16),T.alphaHash&&a.enable(17),T.batching&&a.enable(18),T.dispersion&&a.enable(19),T.retroreflection&&a.enable(24),T.diffuseRoughness&&a.enable(25),T.batchingColor&&a.enable(20),T.gradientMap&&a.enable(21),T.packedNormalMap&&a.enable(22),T.vertexNormals&&a.enable(23),x.push(a.mask),a.disableAll(),T.fog&&a.enable(0),T.useFog&&a.enable(1),T.flatShading&&a.enable(2),T.logarithmicDepthBuffer&&a.enable(3),T.reversedDepthBuffer&&a.enable(4),T.skinning&&a.enable(5),T.morphTargets&&a.enable(6),T.morphNormals&&a.enable(7),T.morphColors&&a.enable(8),T.premultipliedAlpha&&a.enable(9),T.shadowMapEnabled&&a.enable(10),T.doubleSided&&a.enable(11),T.flipSided&&a.enable(12),T.useDepthPacking&&a.enable(13),T.dithering&&a.enable(14),T.transmission&&a.enable(15),T.sheen&&a.enable(16),T.opaque&&a.enable(17),T.pointsUvs&&a.enable(18),T.decodeVideoTexture&&a.enable(19),T.decodeVideoTextureEmissive&&a.enable(20),T.alphaToCoverage&&a.enable(21),T.numLightProbeGrids>0&&a.enable(22),T.hasPositionAttribute&&a.enable(23),x.push(a.mask)}function y(x){let T=d[x.type],N;if(T){let C=kn[T];N=In.clone(C.uniforms)}else N=x.uniforms;return N}function w(x,T){let N=u.get(T);return N!==void 0?++N.usedTimes:(N=new Ax(i,T,x,s),c.push(N),u.set(T,N)),N}function M(x){if(--x.usedTimes===0){let T=c.indexOf(x);c[T]=c[c.length-1],c.pop(),u.delete(x.cacheKey),x.destroy()}}function b(x){o.remove(x)}function E(){o.dispose()}return{getParameters:g,getProgramCacheKey:_,getUniforms:y,acquireProgram:w,releaseProgram:M,releaseShaderCache:b,programs:c,dispose:E}}function Px(){let i=new WeakMap;function e(a){return i.has(a)}function t(a){let o=i.get(a);return o===void 0&&(o={},i.set(a,o)),o}function n(a){i.delete(a)}function s(a,o,l){i.get(a)[o]=l}function r(){i=new WeakMap}return{has:e,get:t,remove:n,update:s,dispose:r}}function Nx(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.material.id!==e.material.id?i.material.id-e.material.id:i.materialVariant!==e.materialVariant?i.materialVariant-e.materialVariant:i.z!==e.z?i.z-e.z:i.id-e.id}function Ed(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.z!==e.z?e.z-i.z:i.id-e.id}function Ad(){let i=[],e=0,t=[],n=[],s=[];function r(){e=0,t.length=0,n.length=0,s.length=0}function a(d){let f=0;return d.isInstancedMesh&&(f+=2),d.isSkinnedMesh&&(f+=1),f}function o(d,f,g,_,m,p){let y=i[e];return y===void 0?(y={id:d.id,object:d,geometry:f,material:g,materialVariant:a(d),groupOrder:_,renderOrder:d.renderOrder,z:m,group:p},i[e]=y):(y.id=d.id,y.object=d,y.geometry=f,y.material=g,y.materialVariant=a(d),y.groupOrder=_,y.renderOrder=d.renderOrder,y.z=m,y.group=p),e++,y}function l(d,f,g,_,m,p,y){y.reversedDepth===!0&&(m=-m);let w=o(d,f,g,_,m,p);g.transmission>0?n.push(w):g.transparent===!0?s.push(w):t.push(w)}function c(d,f,g,_,m,p){let y=o(d,f,g,_,m,p);g.transmission>0?n.unshift(y):g.transparent===!0?s.unshift(y):t.unshift(y)}function u(d,f){t.length>1&&t.sort(d||Nx),n.length>1&&n.sort(f||Ed),s.length>1&&s.sort(f||Ed)}function h(){for(let d=e,f=i.length;d<f;d++){let g=i[d];if(g.id===null)break;g.id=null,g.object=null,g.geometry=null,g.material=null,g.group=null}}return{opaque:t,transmissive:n,transparent:s,init:r,push:l,unshift:c,finish:h,sort:u}}function Lx(){let i=new WeakMap;function e(n,s){let r=i.get(n),a;return r===void 0?(a=new Ad,i.set(n,[a])):s>=r.length?(a=new Ad,r.push(a)):a=r[s],a}function t(){i=new WeakMap}return{get:e,dispose:t}}function Ux(){let i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"SunLight":case"DirectionalLight":t={direction:new D,color:new Te};break;case"SpotLight":t={position:new D,direction:new D,color:new Te,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new D,color:new Te,distance:0,decay:0};break;case"HemisphereLight":t={direction:new D,skyColor:new Te,groundColor:new Te};break;case"RectAreaLight":t={color:new Te,position:new D,halfWidth:new D,halfHeight:new D};break}return i[e.id]=t,t}}}function Dx(){let i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"SunLight":case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ee};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ee};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ee,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[e.id]=t,t}}}var Ox=0;function Fx(i,e){return(e.castShadow?2:0)-(i.castShadow?2:0)+(e.map?1:0)-(i.map?1:0)}function Bx(i){let e=new Ux,t=Dx(),n={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new D);let s=new D,r=new Le,a=new Le;function o(c){let u=0,h=0,d=0;for(let F=0;F<9;F++)n.probe[F].set(0,0,0);let f=0,g=0,_=0,m=0,p=0,y=0,w=0,M=0,b=0,E=0,x=0,T=0,N=0,C=0;c.sort(Fx);for(let F=0,G=c.length;F<G;F++){let A=c[F],U=A.color,B=A.intensity,V=A.distance,$=null;if(A.shadow&&A.shadow.map&&(A.shadow.map.texture.format===wi?$=A.shadow.map.texture:$=A.shadow.map.depthTexture||A.shadow.map.texture),A.isAmbientLight)u+=U.r*B,h+=U.g*B,d+=U.b*B;else if(A.isLightProbe){for(let q=0;q<9;q++)n.probe[q].addScaledVector(A.sh.coefficients[q],B);C++}else if(A.isSunLight){let q=e.get(A);if(q.color.copy(A.color).multiplyScalar(A.intensity),A.castShadow){let Q=A.shadow,ee=t.get(A);ee.shadowIntensity=Q.intensity,ee.shadowBias=Q.bias,ee.shadowNormalBias=Q.normalBias,ee.shadowRadius=Q.radius,ee.shadowMapSize.copy(Q.mapSize).multiply(Q.getFrameExtents()),n.sunShadow[g]=ee,n.sunShadowMap[g]=$;let ve=Q.getViewportCount();for(let Ie=0;Ie<ve;Ie++)n.sunShadowMatrix[_+Ie]=Q.getMatrix(Ie),n.sunShadowCascade[_+Ie]=Q._cascadeData[Ie];_+=ve,g++}n.sun[f]=q,f++}else if(A.isDirectionalLight){let q=e.get(A);if(q.color.copy(A.color).multiplyScalar(A.intensity),A.castShadow){let Q=A.shadow,ee=t.get(A);ee.shadowIntensity=Q.intensity,ee.shadowBias=Q.bias,ee.shadowNormalBias=Q.normalBias,ee.shadowRadius=Q.radius,ee.shadowMapSize=Q.mapSize,n.directionalShadow[m]=ee,n.directionalShadowMap[m]=$,n.directionalShadowMatrix[m]=A.shadow.matrix,b++}n.directional[m]=q,m++}else if(A.isSpotLight){let q=e.get(A);q.position.setFromMatrixPosition(A.matrixWorld),q.color.copy(U).multiplyScalar(B),q.distance=V,q.coneCos=Math.cos(A.angle),q.penumbraCos=Math.cos(A.angle*(1-A.penumbra)),q.decay=A.decay,n.spot[y]=q;let Q=A.shadow;if(A.map&&(n.spotLightMap[T]=A.map,T++,Q.updateMatrices(A),A.castShadow&&N++),n.spotLightMatrix[y]=Q.matrix,A.castShadow){let ee=t.get(A);ee.shadowIntensity=Q.intensity,ee.shadowBias=Q.bias,ee.shadowNormalBias=Q.normalBias,ee.shadowRadius=Q.radius,ee.shadowMapSize=Q.mapSize,n.spotShadow[y]=ee,n.spotShadowMap[y]=$,x++}y++}else if(A.isRectAreaLight){let q=e.get(A);q.color.copy(U).multiplyScalar(B),q.halfWidth.set(A.width*.5,0,0),q.halfHeight.set(0,A.height*.5,0),n.rectArea[w]=q,w++}else if(A.isPointLight){let q=e.get(A);if(q.color.copy(A.color).multiplyScalar(A.intensity),q.distance=A.distance,q.decay=A.decay,A.castShadow){let Q=A.shadow,ee=t.get(A);ee.shadowIntensity=Q.intensity,ee.shadowBias=Q.bias,ee.shadowNormalBias=Q.normalBias,ee.shadowRadius=Q.radius,ee.shadowMapSize=Q.mapSize,ee.shadowCameraNear=Q.camera.near,ee.shadowCameraFar=Q.camera.far,n.pointShadow[p]=ee,n.pointShadowMap[p]=$,n.pointShadowMatrix[p]=A.shadow.matrix,E++}n.point[p]=q,p++}else if(A.isHemisphereLight){let q=e.get(A);q.skyColor.copy(A.color).multiplyScalar(B),q.groundColor.copy(A.groundColor).multiplyScalar(B),n.hemi[M]=q,M++}}w>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=me.LTC_FLOAT_1,n.rectAreaLTC2=me.LTC_FLOAT_2):(n.rectAreaLTC1=me.LTC_HALF_1,n.rectAreaLTC2=me.LTC_HALF_2)),n.ambient[0]=u,n.ambient[1]=h,n.ambient[2]=d;let P=n.hash;(P.sunLength!==f||P.directionalLength!==m||P.pointLength!==p||P.spotLength!==y||P.rectAreaLength!==w||P.hemiLength!==M||P.numSunShadows!==g||P.numDirectionalShadows!==b||P.numPointShadows!==E||P.numSpotShadows!==x||P.numSpotMaps!==T||P.numLightProbes!==C)&&(n.sun.length=f,n.directional.length=m,n.spot.length=y,n.rectArea.length=w,n.point.length=p,n.hemi.length=M,n.sunShadow.length=g,n.sunShadowMap.length=g,n.sunShadowMatrix.length=_,n.sunShadowCascade.length=_,n.directionalShadow.length=b,n.directionalShadowMap.length=b,n.directionalShadowMatrix.length=b,n.pointShadow.length=E,n.pointShadowMap.length=E,n.pointShadowMatrix.length=E,n.spotShadow.length=x,n.spotShadowMap.length=x,n.spotLightMatrix.length=x+T-N,n.spotLightMap.length=T,n.numSpotLightShadowsWithMaps=N,n.numLightProbes=C,P.sunLength=f,P.directionalLength=m,P.pointLength=p,P.spotLength=y,P.rectAreaLength=w,P.hemiLength=M,P.numSunShadows=g,P.numDirectionalShadows=b,P.numPointShadows=E,P.numSpotShadows=x,P.numSpotMaps=T,P.numLightProbes=C,n.version=Ox++)}function l(c,u){let h=0,d=0,f=0,g=0,_=0,m=0,p=u.matrixWorldInverse;for(let y=0,w=c.length;y<w;y++){let M=c[y];if(M.isSunLight){let b=n.sun[h];b.direction.setFromMatrixPosition(M.matrixWorld),b.direction.transformDirection(p),h++}else if(M.isDirectionalLight){let b=n.directional[d];b.direction.setFromMatrixPosition(M.matrixWorld),s.setFromMatrixPosition(M.target.matrixWorld),b.direction.sub(s),b.direction.transformDirection(p),d++}else if(M.isSpotLight){let b=n.spot[g];b.position.setFromMatrixPosition(M.matrixWorld),b.position.applyMatrix4(p),b.direction.setFromMatrixPosition(M.matrixWorld),s.setFromMatrixPosition(M.target.matrixWorld),b.direction.sub(s),b.direction.transformDirection(p),g++}else if(M.isRectAreaLight){let b=n.rectArea[_];b.position.setFromMatrixPosition(M.matrixWorld),b.position.applyMatrix4(p),a.identity(),r.copy(M.matrixWorld),r.premultiply(p),a.extractRotation(r),b.halfWidth.set(M.width*.5,0,0),b.halfHeight.set(0,M.height*.5,0),b.halfWidth.applyMatrix4(a),b.halfHeight.applyMatrix4(a),_++}else if(M.isPointLight){let b=n.point[f];b.position.setFromMatrixPosition(M.matrixWorld),b.position.applyMatrix4(p),f++}else if(M.isHemisphereLight){let b=n.hemi[m];b.direction.setFromMatrixPosition(M.matrixWorld),b.direction.transformDirection(p),m++}}}return{setup:o,setupView:l,state:n}}function Rd(i){let e=new Bx(i),t=[],n=[],s=[];function r(h){u.camera=h,t.length=0,n.length=0,s.length=0}function a(h){h.isLightProbeGrid?s.push(h):t.push(h)}function o(h){n.push(h)}function l(){e.setup(t),s.sort((h,d)=>h.priority-d.priority||h.id-d.id)}function c(h){e.setupView(t,h)}let u={lightsArray:t,shadowsArray:n,lightProbeGridArray:s,camera:null,lights:e,transmissionRenderTarget:{},textureUnits:0};return{init:r,state:u,setupLights:l,setupLightsView:c,pushLight:a,pushShadow:o}}function Vx(i){let e=new WeakMap;function t(s,r=0){let a=e.get(s),o;return a===void 0?(o=new Rd(i),e.set(s,[o])):r>=a.length?(o=new Rd(i),a.push(o)):o=a[r],o}function n(){e=new WeakMap}return{get:t,dispose:n}}var kx=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,zx=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,Gx=[new D(1,0,0),new D(-1,0,0),new D(0,1,0),new D(0,-1,0),new D(0,0,1),new D(0,0,-1)],Hx=[new D(0,-1,0),new D(0,-1,0),new D(0,0,1),new D(0,0,-1),new D(0,-1,0),new D(0,-1,0)],Cd=new Le,$r=new D,Pc=new D;function Wx(i,e,t){let n=new Mi,s=new Ee,r=new Ee,a=new Ye,o=new eo,l=new to,c={},u=t.maxTextureSize,h={[Mn]:Rt,[Rt]:Mn,[Xt]:Xt},d=new dt({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Ee},radius:{value:4}},vertexShader:kx,fragmentShader:zx}),f=d.clone();f.defines.HORIZONTAL_PASS=1;let g=new gt;g.setAttribute("position",new Bt(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let _=new je(g,d),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Wi;let p=this.type;this.render=function(E,x,T){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||E.length===0)return;this.type===Ah&&(be("WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."),this.type=Wi);let N=i.getRenderTarget(),C=i.getActiveCubeFace(),P=i.getActiveMipmapLevel(),F=i.state;F.setBlending(oi),F.buffers.depth.getReversed()===!0?F.buffers.color.setClear(0,0,0,0):F.buffers.color.setClear(1,1,1,1),F.buffers.depth.setTest(!0),F.setScissorTest(!1);let G=p!==this.type;G&&x.traverse(function(A){A.material&&(Array.isArray(A.material)?A.material.forEach(U=>U.needsUpdate=!0):A.material.needsUpdate=!0)});for(let A=0,U=E.length;A<U;A++){let B=E[A],V=B.shadow;if(V===void 0){be("WebGLShadowMap:",B,"has no shadow.");continue}if(V.autoUpdate===!1&&V.needsUpdate===!1)continue;s.copy(V.mapSize);let $=V.getFrameExtents();s.multiply($),r.copy(V.mapSize),(s.x>u||s.y>u)&&(s.x>u&&(r.x=Math.floor(u/$.x),s.x=r.x*$.x,V.mapSize.x=r.x),s.y>u&&(r.y=Math.floor(u/$.y),s.y=r.y*$.y,V.mapSize.y=r.y));let q=i.state.buffers.depth.getReversed();if(V.camera._reversedDepth=q,V.map===null||G===!0){if(V.map!==null&&(V.map.depthTexture!==null&&(V.map.depthTexture.dispose(),V.map.depthTexture=null),V.map.dispose()),this.type===Bs){if(B.isPointLight){be("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}V.map=new mt(s.x,s.y,{format:wi,type:_t,minFilter:ut,magFilter:ut,generateMipmaps:!1}),V.map.texture.name=B.name+".shadowMap",V.map.depthTexture=new ei(s.x,s.y,fn),V.map.depthTexture.name=B.name+".shadowMapDepth",V.map.depthTexture.format=Jn,V.map.depthTexture.compareFunction=null,V.map.depthTexture.minFilter=vt,V.map.depthTexture.magFilter=vt}else B.isPointLight?(V.map=new $i(s.x),V.map.depthTexture=new Er(s.x,Cn)):(V.map=new mt(s.x,s.y),V.map.depthTexture=new ei(s.x,s.y,Cn)),V.map.depthTexture.name=B.name+".shadowMap",V.map.depthTexture.format=Jn,this.type===Wi?(V.map.depthTexture.compareFunction=q?yc:xc,V.map.depthTexture.minFilter=ut,V.map.depthTexture.magFilter=ut):(V.map.depthTexture.compareFunction=null,V.map.depthTexture.minFilter=vt,V.map.depthTexture.magFilter=vt);V.camera.updateProjectionMatrix()}V.map.isWebGLCubeRenderTarget!==!0&&(V.map.width!==s.x||V.map.height!==s.y)&&V.map.setSize(s.x,s.y);let Q=V.map.isWebGLCubeRenderTarget?6:V.getViewportCount();B.isPointLight!==!0&&V.updateMatrices(B,T);let ee=(V.camera.layers.mask&4294967294)!==0?V.camera.layers:T.layers;for(let ve=0;ve<Q;ve++){let Ie=V.getCamera(ve);if(B.isPointLight){let j=V.camera,ce=V.matrix,xe=B.distance||j.far;xe!==j.far&&(j.far=xe,j.updateProjectionMatrix()),$r.setFromMatrixPosition(B.matrixWorld),j.position.copy($r),Pc.copy(j.position),Pc.add(Gx[ve]),j.up.copy(Hx[ve]),j.lookAt(Pc),j.updateMatrixWorld(),ce.makeTranslation(-$r.x,-$r.y,-$r.z),Cd.multiplyMatrices(j.projectionMatrix,j.matrixWorldInverse),V._frustum.setFromProjectionMatrix(Cd,j.coordinateSystem,j.reversedDepth)}if(V.map.isWebGLCubeRenderTarget)i.setRenderTarget(V.map,ve),i.clear();else{ve===0&&(i.setRenderTarget(V.map),i.clear());let j=V.getViewport(ve);a.set(r.x*j.x,r.y*j.y,r.x*j.z,r.y*j.w),F.viewport(a)}n=V.getFrustum(ve),M(x,T,Ie,B,ee,this.type)}V.isPointLightShadow!==!0&&this.type===Bs&&y(V,T),V.needsUpdate=!1}p=this.type,m.needsUpdate=!1,i.setRenderTarget(N,C,P)};function y(E,x){let T=e.update(_);d.defines.VSM_SAMPLES!==E.blurSamples&&(d.defines.VSM_SAMPLES=E.blurSamples,f.defines.VSM_SAMPLES=E.blurSamples,d.needsUpdate=!0,f.needsUpdate=!0),E.mapPass===null?E.mapPass=new mt(s.x,s.y,{format:wi,type:_t}):(E.mapPass.width!==E.map.width||E.mapPass.height!==E.map.height)&&E.mapPass.setSize(E.map.width,E.map.height),d.uniforms.shadow_pass.value=E.map.depthTexture,d.uniforms.resolution.value.set(E.map.width,E.map.height),d.uniforms.radius.value=E.radius,i.setRenderTarget(E.mapPass),i.clear(),i.renderBufferDirect(x,null,T,d,_,null),f.uniforms.shadow_pass.value=E.mapPass.texture,f.uniforms.resolution.value.set(E.map.width,E.map.height),f.uniforms.radius.value=E.radius,i.setRenderTarget(E.map),i.clear(),i.renderBufferDirect(x,null,T,f,_,null)}function w(E,x,T,N){let C=null,P=T.isPointLight===!0?E.customDistanceMaterial:E.customDepthMaterial;if(P!==void 0)C=P;else if(C=T.isPointLight===!0?l:o,i.localClippingEnabled&&x.clipShadows===!0&&Array.isArray(x.clippingPlanes)&&x.clippingPlanes.length!==0||x.displacementMap&&x.displacementScale!==0||x.alphaMap&&x.alphaTest>0||x.map&&x.alphaTest>0||x.alphaToCoverage===!0){let F=C.uuid,G=x.uuid,A=c[F];A===void 0&&(A={},c[F]=A);let U=A[G];U===void 0&&(U=C.clone(),A[G]=U,x.addEventListener("dispose",b)),C=U}if(C.visible=x.visible,C.wireframe=x.wireframe,N===Bs?C.side=x.shadowSide!==null?x.shadowSide:x.side:C.side=x.shadowSide!==null?x.shadowSide:h[x.side],C.alphaMap=x.alphaMap,C.alphaTest=x.alphaToCoverage===!0?.5:x.alphaTest,C.map=x.map,C.clipShadows=x.clipShadows,C.clippingPlanes=x.clippingPlanes,C.clipIntersection=x.clipIntersection,C.displacementMap=x.displacementMap,C.displacementScale=x.displacementScale,C.displacementBias=x.displacementBias,C.wireframeLinewidth=x.wireframeLinewidth,C.linewidth=x.linewidth,T.isPointLight===!0&&C.isMeshDistanceMaterial===!0){let F=i.properties.get(C);F.light=T}return C}function M(E,x,T,N,C,P){if(E.visible===!1)return;if(E.layers.test(C)&&(E.isMesh||E.isLine||E.isPoints)&&(E.castShadow||E.receiveShadow&&P===Bs)&&(!E.frustumCulled||E.intersectsFrustum(n))){E.modelViewMatrix.multiplyMatrices(T.matrixWorldInverse,E.matrixWorld);let A=e.update(E),U=E.material;if(Array.isArray(U)){let B=A.groups;for(let V=0,$=B.length;V<$;V++){let q=B[V],Q=U[q.materialIndex];if(Q&&Q.visible){let ee=w(E,Q,N,P);E.onBeforeShadow(i,E,x,T,A,ee,q),i.renderBufferDirect(T,null,A,ee,E,q),E.onAfterShadow(i,E,x,T,A,ee,q)}}}else if(U.visible){let B=w(E,U,N,P);E.onBeforeShadow(i,E,x,T,A,B,null),i.renderBufferDirect(T,null,A,B,E,null),E.onAfterShadow(i,E,x,T,A,B,null)}}let G=E.children;for(let A=0,U=G.length;A<U;A++)M(G[A],x,T,N,C,P)}function b(E){E.target.removeEventListener("dispose",b);for(let T in c){let N=c[T],C=E.target.uuid;C in N&&(N[C].dispose(),delete N[C])}}}function qx(i,e){function t(){let I=!1,Y=new Ye,X=null,oe=new Ye(0,0,0,0);return{setMask:function(ie){X!==ie&&!I&&(i.colorMask(ie,ie,ie,ie),X=ie)},setLocked:function(ie){I=ie},setClear:function(ie,re,we,ze,ne){ne===!0&&(ie*=ze,re*=ze,we*=ze),Y.set(ie,re,we,ze),oe.equals(Y)===!1&&(i.clearColor(ie,re,we,ze),oe.copy(Y))},reset:function(){I=!1,X=null,oe.set(-1,0,0,0)}}}function n(){let I=!1,Y=!1,X=null,oe=null,ie=null;return{setReversed:function(re){if(Y!==re){let we=e.get("EXT_clip_control");re?we.clipControlEXT(we.LOWER_LEFT_EXT,we.ZERO_TO_ONE_EXT):we.clipControlEXT(we.LOWER_LEFT_EXT,we.NEGATIVE_ONE_TO_ONE_EXT),Y=re;let ze=ie;ie=null,this.setClear(ze)}},getReversed:function(){return Y},setTest:function(re){re?fe(i.DEPTH_TEST):De(i.DEPTH_TEST)},setMask:function(re){X!==re&&!I&&(i.depthMask(re),X=re)},setFunc:function(re){if(Y&&(re=rd[re]),oe!==re){switch(re){case Ga:i.depthFunc(i.NEVER);break;case Ha:i.depthFunc(i.ALWAYS);break;case Wa:i.depthFunc(i.LESS);break;case vs:i.depthFunc(i.LEQUAL);break;case qa:i.depthFunc(i.EQUAL);break;case Xa:i.depthFunc(i.GEQUAL);break;case Ka:i.depthFunc(i.GREATER);break;case ja:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}oe=re}},setLocked:function(re){I=re},setClear:function(re){ie!==re&&(ie=re,Y&&(re=1-re),i.clearDepth(re))},reset:function(){I=!1,X=null,oe=null,ie=null,Y=!1}}}function s(){let I=!1,Y=null,X=null,oe=null,ie=null,re=null,we=null,ze=null,ne=null;return{setTest:function(Ae){I||(Ae?fe(i.STENCIL_TEST):De(i.STENCIL_TEST))},setMask:function(Ae){Y!==Ae&&!I&&(i.stencilMask(Ae),Y=Ae)},setFunc:function(Ae,Be,pe){(X!==Ae||oe!==Be||ie!==pe)&&(i.stencilFunc(Ae,Be,pe),X=Ae,oe=Be,ie=pe)},setOp:function(Ae,Be,pe){(re!==Ae||we!==Be||ze!==pe)&&(i.stencilOp(Ae,Be,pe),re=Ae,we=Be,ze=pe)},setLocked:function(Ae){I=Ae},setClear:function(Ae){ne!==Ae&&(i.clearStencil(Ae),ne=Ae)},reset:function(){I=!1,Y=null,X=null,oe=null,ie=null,re=null,we=null,ze=null,ne=null}}}let r=new t,a=new n,o=new s,l={},c=new WeakMap,u={},h={},d={},f=new WeakMap,g=[],_=null,m=!1,p=null,y=null,w=null,M=null,b=null,E=null,x=null,T=new Te(0,0,0),N=0,C=!1,P=null,F=null,G=null,A=null,U=null,B=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS),V=!1,$=0,q=i.getParameter(i.VERSION);q.indexOf("WebGL")!==-1?($=parseFloat(/^WebGL (\d)/.exec(q)[1]),V=$>=1):q.indexOf("OpenGL ES")!==-1&&($=parseFloat(/^OpenGL ES (\d)/.exec(q)[1]),V=$>=2);let Q=null,ee={},ve=i.getParameter(i.SCISSOR_BOX),Ie=i.getParameter(i.VIEWPORT),j=new Ye().fromArray(ve),ce=new Ye().fromArray(Ie);function xe(I,Y,X,oe){let ie=new Uint8Array(4),re=i.createTexture();i.bindTexture(I,re),i.texParameteri(I,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(I,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let we=0;we<X;we++)I===i.TEXTURE_3D||I===i.TEXTURE_2D_ARRAY?i.texImage3D(Y,0,i.RGBA,1,1,oe,0,i.RGBA,i.UNSIGNED_BYTE,ie):i.texImage2D(Y+we,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,ie);return re}let Re={};Re[i.TEXTURE_2D]=xe(i.TEXTURE_2D,i.TEXTURE_2D,1),Re[i.TEXTURE_CUBE_MAP]=xe(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),Re[i.TEXTURE_2D_ARRAY]=xe(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),Re[i.TEXTURE_3D]=xe(i.TEXTURE_3D,i.TEXTURE_3D,1,1),r.setClear(0,0,0,1),a.setClear(1),o.setClear(0),fe(i.DEPTH_TEST),a.setFunc(vs),$t(!1),lt(sc),fe(i.CULL_FACE),Ot(oi);function fe(I){u[I]!==!0&&(i.enable(I),u[I]=!0)}function De(I){u[I]!==!1&&(i.disable(I),u[I]=!1)}function St(I,Y){return d[I]!==Y?(i.bindFramebuffer(I,Y),d[I]=Y,I===i.DRAW_FRAMEBUFFER&&(d[i.FRAMEBUFFER]=Y),I===i.FRAMEBUFFER&&(d[i.DRAW_FRAMEBUFFER]=Y),!0):!1}function Pe(I,Y){let X=g,oe=!1;if(I){X=f.get(Y),X===void 0&&(X=[],f.set(Y,X));let ie=I.textures;if(X.length!==ie.length||X[0]!==i.COLOR_ATTACHMENT0){for(let re=0,we=ie.length;re<we;re++)X[re]=i.COLOR_ATTACHMENT0+re;X.length=ie.length,oe=!0}}else X[0]!==i.BACK&&(X[0]=i.BACK,oe=!0);oe&&i.drawBuffers(X)}function et(I){return _!==I?(i.useProgram(I),_=I,!0):!1}let nt={[Xi]:i.FUNC_ADD,[Rh]:i.FUNC_SUBTRACT,[Ch]:i.FUNC_REVERSE_SUBTRACT};nt[Ih]=i.MIN,nt[Ph]=i.MAX;let qe={[Nh]:i.ZERO,[ho]:i.ONE,[Lh]:i.SRC_COLOR,[oc]:i.SRC_ALPHA,[Vh]:i.SRC_ALPHA_SATURATE,[Fh]:i.DST_COLOR,[Dh]:i.DST_ALPHA,[Uh]:i.ONE_MINUS_SRC_COLOR,[Vr]:i.ONE_MINUS_SRC_ALPHA,[Bh]:i.ONE_MINUS_DST_COLOR,[Oh]:i.ONE_MINUS_DST_ALPHA,[kh]:i.CONSTANT_COLOR,[zh]:i.ONE_MINUS_CONSTANT_COLOR,[Gh]:i.CONSTANT_ALPHA,[Hh]:i.ONE_MINUS_CONSTANT_ALPHA};function Ot(I,Y,X,oe,ie,re,we,ze,ne,Ae){if(I===oi){m===!0&&(De(i.BLEND),m=!1);return}if(m===!1&&(fe(i.BLEND),m=!0),I!==uo){if(I!==p||Ae!==C){if((y!==Xi||b!==Xi)&&(i.blendEquation(i.FUNC_ADD),y=Xi,b=Xi),Ae)switch(I){case Vs:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case qi:i.blendFunc(i.ONE,i.ONE);break;case rc:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case ac:i.blendFuncSeparate(i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA,i.ZERO,i.ONE);break;default:Ne("WebGLState: Invalid blending: ",I);break}else switch(I){case Vs:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case qi:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE,i.ONE,i.ONE);break;case rc:Ne("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case ac:Ne("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Ne("WebGLState: Invalid blending: ",I);break}w=null,M=null,E=null,x=null,T.set(0,0,0),N=0,p=I,C=Ae}return}ie=ie||Y,re=re||X,we=we||oe,(Y!==y||ie!==b)&&(i.blendEquationSeparate(nt[Y],nt[ie]),y=Y,b=ie),(X!==w||oe!==M||re!==E||we!==x)&&(i.blendFuncSeparate(qe[X],qe[oe],qe[re],qe[we]),w=X,M=oe,E=re,x=we),(ze.equals(T)===!1||ne!==N)&&(i.blendColor(ze.r,ze.g,ze.b,ne),T.copy(ze),N=ne),p=I,C=!1}function wt(I,Y){I.side===Xt?De(i.CULL_FACE):fe(i.CULL_FACE);let X=I.side===Rt;Y&&(X=!X),$t(X),I.blending===Vs&&I.transparent===!1?Ot(oi):Ot(I.blending,I.blendEquation,I.blendSrc,I.blendDst,I.blendEquationAlpha,I.blendSrcAlpha,I.blendDstAlpha,I.blendColor,I.blendAlpha,I.premultipliedAlpha),a.setFunc(I.depthFunc),a.setTest(I.depthTest),a.setMask(I.depthWrite),r.setMask(I.colorWrite);let oe=I.stencilWrite;o.setTest(oe),oe&&(o.setMask(I.stencilWriteMask),o.setFunc(I.stencilFunc,I.stencilRef,I.stencilFuncMask),o.setOp(I.stencilFail,I.stencilZFail,I.stencilZPass)),Pt(I.polygonOffset,I.polygonOffsetFactor,I.polygonOffsetUnits),I.alphaToCoverage===!0?fe(i.SAMPLE_ALPHA_TO_COVERAGE):De(i.SAMPLE_ALPHA_TO_COVERAGE)}function $t(I){P!==I&&(I?i.frontFace(i.CW):i.frontFace(i.CCW),P=I)}function lt(I){I!==wh?(fe(i.CULL_FACE),I!==F&&(I===sc?i.cullFace(i.BACK):I===Eh?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):De(i.CULL_FACE),F=I}function Pn(I){I!==G&&(V&&i.lineWidth(I),G=I)}function Pt(I,Y,X){I?(fe(i.POLYGON_OFFSET_FILL),(A!==Y||U!==X)&&(A=Y,U=X,a.getReversed()&&(Y=-Y,X=-X),i.polygonOffset(Y,X))):De(i.POLYGON_OFFSET_FILL)}function mn(I){I?fe(i.SCISSOR_TEST):De(i.SCISSOR_TEST)}function gn(I){I===void 0&&(I=i.TEXTURE0+B-1),Q!==I&&(i.activeTexture(I),Q=I)}function xn(I,Y,X){X===void 0&&(Q===null?X=i.TEXTURE0+B-1:X=Q);let oe=ee[X];oe===void 0&&(oe={type:void 0,texture:void 0},ee[X]=oe),(oe.type!==I||oe.texture!==Y)&&(Q!==X&&(i.activeTexture(X),Q=X),i.bindTexture(I,Y||Re[I]),oe.type=I,oe.texture=Y)}function O(){let I=ee[Q];I!==void 0&&I.type!==void 0&&(i.bindTexture(I.type,null),I.type=void 0,I.texture=void 0)}function yn(){try{i.compressedTexImage2D(...arguments)}catch(I){Ne("WebGLState:",I)}}function at(){try{i.compressedTexImage3D(...arguments)}catch(I){Ne("WebGLState:",I)}}function ot(){try{i.texSubImage2D(...arguments)}catch(I){Ne("WebGLState:",I)}}function de(){try{i.texSubImage3D(...arguments)}catch(I){Ne("WebGLState:",I)}}function Et(){try{i.compressedTexSubImage2D(...arguments)}catch(I){Ne("WebGLState:",I)}}function Ce(){try{i.compressedTexSubImage3D(...arguments)}catch(I){Ne("WebGLState:",I)}}function Oe(){try{i.texStorage2D(...arguments)}catch(I){Ne("WebGLState:",I)}}function R(){try{i.texStorage3D(...arguments)}catch(I){Ne("WebGLState:",I)}}function v(){try{i.texImage2D(...arguments)}catch(I){Ne("WebGLState:",I)}}function z(){try{i.texImage3D(...arguments)}catch(I){Ne("WebGLState:",I)}}function te(I){return h[I]!==void 0?h[I]:i.getParameter(I)}function J(I,Y){h[I]!==Y&&(i.pixelStorei(I,Y),h[I]=Y)}function se(I){j.equals(I)===!1&&(i.scissor(I.x,I.y,I.z,I.w),j.copy(I))}function ue(I){ce.equals(I)===!1&&(i.viewport(I.x,I.y,I.z,I.w),ce.copy(I))}function K(I,Y){let X=c.get(Y);X===void 0&&(X=new WeakMap,c.set(Y,X));let oe=X.get(I);oe===void 0&&(oe=i.getUniformBlockIndex(Y,I.name),i.uniformBlockBinding(Y,oe,oe),X.set(I,oe))}function Z(I,Y,X){let ie=c.get(Y).get(I);l[ie]!==X&&(i.bindBufferBase(i.UNIFORM_BUFFER,ie,X),l[ie]=X)}function ae(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),a.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),i.pixelStorei(i.PACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,!1),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,i.BROWSER_DEFAULT_WEBGL),i.pixelStorei(i.PACK_ROW_LENGTH,0),i.pixelStorei(i.PACK_SKIP_PIXELS,0),i.pixelStorei(i.PACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_IMAGE_HEIGHT,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_SKIP_IMAGES,0),u={},h={},Q=null,ee={},d={},l={},f=new WeakMap,g=[],_=null,m=!1,p=null,y=null,w=null,M=null,b=null,E=null,x=null,T=new Te(0,0,0),N=0,C=!1,P=null,F=null,G=null,A=null,U=null,j.set(0,0,i.canvas.width,i.canvas.height),ce.set(0,0,i.canvas.width,i.canvas.height),r.reset(),a.reset(),o.reset()}return{buffers:{color:r,depth:a,stencil:o},enable:fe,disable:De,bindFramebuffer:St,drawBuffers:Pe,useProgram:et,setBlending:Ot,setMaterial:wt,setFlipSided:$t,setCullFace:lt,setLineWidth:Pn,setPolygonOffset:Pt,setScissorTest:mn,activeTexture:gn,bindTexture:xn,unbindTexture:O,compressedTexImage2D:yn,compressedTexImage3D:at,texImage2D:v,texImage3D:z,pixelStorei:J,getParameter:te,updateUBOMapping:K,uniformBlockBinding:Z,texStorage2D:Oe,texStorage3D:R,texSubImage2D:ot,texSubImage3D:de,compressedTexSubImage2D:Et,compressedTexSubImage3D:Ce,scissor:se,viewport:ue,reset:ae}}function Xx(i,e,t,n,s,r,a){let o=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new Ee,u=new WeakMap,h=new Set,d,f=new WeakMap,g=new Set,_=new FinalizationRegistry(R=>g.delete(R)),m=!1;try{m=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function p(R,v){return m?new OffscreenCanvas(R,v):Ms("canvas")}function y(R,v,z){let te=1,J=Oe(R);if((J.width>z||J.height>z)&&(te=z/Math.max(J.width,J.height)),te<1)if(typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&R instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&R instanceof ImageBitmap||typeof VideoFrame<"u"&&R instanceof VideoFrame){let se=Math.floor(te*J.width),ue=Math.floor(te*J.height);d===void 0&&(d=p(se,ue));let K=v?p(se,ue):d;return K.width=se,K.height=ue,K.getContext("2d").drawImage(R,0,0,se,ue),be("WebGLRenderer: Texture has been resized from ("+J.width+"x"+J.height+") to ("+se+"x"+ue+")."),K}else return"data"in R&&be("WebGLRenderer: Image in DataTexture is too big ("+J.width+"x"+J.height+")."),R;return R}function w(R){return R.generateMipmaps}function M(R){i.generateMipmap(R)}function b(R){return R.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:R.isWebGL3DRenderTarget?i.TEXTURE_3D:R.isWebGLArrayRenderTarget||R.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function E(R,v,z,te,J,se=!1){if(R!==null){if(i[R]!==void 0)return i[R];be("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+R+"'")}let ue;te&&(ue=e.get("EXT_texture_norm16"),ue||be("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let K=v;if(v===i.RED&&(z===i.FLOAT&&(K=i.R32F),z===i.HALF_FLOAT&&(K=i.R16F),z===i.UNSIGNED_BYTE&&(K=i.R8),z===i.UNSIGNED_SHORT&&ue&&(K=ue.R16_EXT),z===i.SHORT&&ue&&(K=ue.R16_SNORM_EXT)),v===i.RED_INTEGER&&(z===i.UNSIGNED_BYTE&&(K=i.R8UI),z===i.UNSIGNED_SHORT&&(K=i.R16UI),z===i.UNSIGNED_INT&&(K=i.R32UI),z===i.BYTE&&(K=i.R8I),z===i.SHORT&&(K=i.R16I),z===i.INT&&(K=i.R32I)),v===i.RG&&(z===i.FLOAT&&(K=i.RG32F),z===i.HALF_FLOAT&&(K=i.RG16F),z===i.UNSIGNED_BYTE&&(K=i.RG8),z===i.UNSIGNED_SHORT&&ue&&(K=ue.RG16_EXT),z===i.SHORT&&ue&&(K=ue.RG16_SNORM_EXT)),v===i.RG_INTEGER&&(z===i.UNSIGNED_BYTE&&(K=i.RG8UI),z===i.UNSIGNED_SHORT&&(K=i.RG16UI),z===i.UNSIGNED_INT&&(K=i.RG32UI),z===i.BYTE&&(K=i.RG8I),z===i.SHORT&&(K=i.RG16I),z===i.INT&&(K=i.RG32I)),v===i.RGB_INTEGER&&(z===i.UNSIGNED_BYTE&&(K=i.RGB8UI),z===i.UNSIGNED_SHORT&&(K=i.RGB16UI),z===i.UNSIGNED_INT&&(K=i.RGB32UI),z===i.BYTE&&(K=i.RGB8I),z===i.SHORT&&(K=i.RGB16I),z===i.INT&&(K=i.RGB32I)),v===i.RGBA_INTEGER&&(z===i.UNSIGNED_BYTE&&(K=i.RGBA8UI),z===i.UNSIGNED_SHORT&&(K=i.RGBA16UI),z===i.UNSIGNED_INT&&(K=i.RGBA32UI),z===i.BYTE&&(K=i.RGBA8I),z===i.SHORT&&(K=i.RGBA16I),z===i.INT&&(K=i.RGBA32I)),v===i.RGB&&(z===i.UNSIGNED_SHORT&&ue&&(K=ue.RGB16_EXT),z===i.SHORT&&ue&&(K=ue.RGB16_SNORM_EXT),z===i.UNSIGNED_INT_5_9_9_9_REV&&(K=i.RGB9_E5),z===i.UNSIGNED_INT_10F_11F_11F_REV&&(K=i.R11F_G11F_B10F)),v===i.RGBA){let Z=se?pr:Ve.getTransfer(J);z===i.FLOAT&&(K=i.RGBA32F),z===i.HALF_FLOAT&&(K=i.RGBA16F),z===i.UNSIGNED_BYTE&&(K=Z===Je?i.SRGB8_ALPHA8:i.RGBA8),z===i.UNSIGNED_SHORT&&ue&&(K=ue.RGBA16_EXT),z===i.SHORT&&ue&&(K=ue.RGBA16_SNORM_EXT),z===i.UNSIGNED_SHORT_4_4_4_4&&(K=i.RGBA4),z===i.UNSIGNED_SHORT_5_5_5_1&&(K=i.RGB5_A1)}return(K===i.R16F||K===i.R32F||K===i.RG16F||K===i.RG32F||K===i.RGBA16F||K===i.RGBA32F)&&e.get("EXT_color_buffer_float"),K}function x(R,v){let z;return R?v===null||v===Cn||v===Yi?z=i.DEPTH24_STENCIL8:v===fn?z=i.DEPTH32F_STENCIL8:v===Gs&&(z=i.DEPTH24_STENCIL8,be("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):v===null||v===Cn||v===Yi?z=i.DEPTH_COMPONENT24:v===fn?z=i.DEPTH_COMPONENT32F:v===Gs&&(z=i.DEPTH_COMPONENT16),z}function T(R,v){return w(R)===!0||R.isFramebufferTexture&&R.minFilter!==vt&&R.minFilter!==ut?Math.log2(Math.max(v.width,v.height))+1:R.mipmaps.length>0?R.mipmaps.length:R.isCompressedTexture&&Array.isArray(R.image)?v.mipmaps.length:1}function N(R){let v=new WeakRef(R);n.get(R).__ref=v,g.add(v),_.register(R,v,v)}function C(R){let v=n.get(R).__ref;v!==void 0&&(g.delete(v),_.unregister(v))}function P(R){G(R.target)}function F(R){A(R.target)}function G(R){R.removeEventListener("dispose",P),C(R),B(R),R.isVideoTexture&&u.delete(R),R.isHTMLTexture&&h.delete(R)}function A(R){R.removeEventListener("dispose",F),C(R),$(R)}function U(){for(let R of g){let v=R.deref();v!==void 0&&(v.isRenderTarget===!0?A(v):G(v))}g.clear(),h.clear()}function B(R){let v=n.get(R);if(v.__webglInit===void 0)return;let z=R.source,te=f.get(z);if(te){let J=te[v.__cacheKey];J.usedTimes--,J.usedTimes===0&&V(R),Object.keys(te).length===0&&f.delete(z)}n.remove(R)}function V(R){let v=n.get(R);i.deleteTexture(v.__webglTexture);let z=R.source,te=f.get(z);delete te[v.__cacheKey],a.memory.textures--}function $(R){let v=n.get(R);v.__depthDisposeCallback&&v.__depthDisposeCallback();let z=R.depthTexture;if(z&&z.renderTarget===R&&G(z),R.isWebGLCubeRenderTarget)for(let J=0;J<6;J++){if(Array.isArray(v.__webglFramebuffer[J]))for(let se=0;se<v.__webglFramebuffer[J].length;se++)i.deleteFramebuffer(v.__webglFramebuffer[J][se]);else i.deleteFramebuffer(v.__webglFramebuffer[J]);v.__webglDepthbuffer&&i.deleteRenderbuffer(v.__webglDepthbuffer[J])}else{if(Array.isArray(v.__webglFramebuffer))for(let J=0;J<v.__webglFramebuffer.length;J++)i.deleteFramebuffer(v.__webglFramebuffer[J]);else i.deleteFramebuffer(v.__webglFramebuffer);if(v.__webglDepthbuffer&&i.deleteRenderbuffer(v.__webglDepthbuffer),v.__webglMultisampledFramebuffer&&i.deleteFramebuffer(v.__webglMultisampledFramebuffer),v.__webglColorRenderbuffer)for(let J=0;J<v.__webglColorRenderbuffer.length;J++)v.__webglColorRenderbuffer[J]&&i.deleteRenderbuffer(v.__webglColorRenderbuffer[J]);v.__webglDepthRenderbuffer&&i.deleteRenderbuffer(v.__webglDepthRenderbuffer)}let te=R.textures;for(let J=0,se=te.length;J<se;J++){let ue=n.get(te[J]);ue.__webglTexture&&(i.deleteTexture(ue.__webglTexture),a.memory.textures--),n.remove(te[J])}n.remove(R)}let q=0;function Q(){q=0}function ee(){return q}function ve(R){q=R}function Ie(){let R=q;return R>=s.maxTextures&&be("WebGLTextures: Trying to use "+(R+1)+" texture units while this GPU supports only "+s.maxTextures),q+=1,R}function j(R){let v=[];return v.push(R.wrapS),v.push(R.wrapT),v.push(R.wrapR||0),v.push(R.magFilter),v.push(R.minFilter),v.push(R.anisotropy),v.push(R.internalFormat),v.push(R.format),v.push(R.type),v.push(R.generateMipmaps),v.push(R.mipmapsAutoUpdate),v.push(R.premultiplyAlpha),v.push(R.flipY),v.push(R.unpackAlignment),v.push(R.colorSpace),v.join()}function ce(R,v){let z=n.get(R);if(R.isVideoTexture&&Et(R),R.isRenderTargetTexture===!1&&R.isExternalTexture!==!0&&R.version>0&&z.__version!==R.version){let te=R.image;if(te===null)be("WebGLRenderer: Texture marked for update but no image data found.");else if(te.complete===!1)be("WebGLRenderer: Texture marked for update but image is incomplete");else{wt(z,R,v);return}}else R.isExternalTexture&&(z.__webglTexture=R.sourceTexture?R.sourceTexture:null);t.bindTexture(i.TEXTURE_2D,z.__webglTexture,i.TEXTURE0+v)}function xe(R,v){let z=n.get(R);if(R.isRenderTargetTexture===!1&&R.version>0&&z.__version!==R.version){wt(z,R,v);return}else R.isExternalTexture&&(z.__webglTexture=R.sourceTexture?R.sourceTexture:null);t.bindTexture(i.TEXTURE_2D_ARRAY,z.__webglTexture,i.TEXTURE0+v)}function Re(R,v){let z=n.get(R);if(R.isRenderTargetTexture===!1&&R.version>0&&z.__version!==R.version){wt(z,R,v);return}t.bindTexture(i.TEXTURE_3D,z.__webglTexture,i.TEXTURE0+v)}function fe(R,v){let z=n.get(R);if(R.version>0&&z.__version!==R.version){$t(z,R,v);return}t.bindTexture(i.TEXTURE_CUBE_MAP,z.__webglTexture,i.TEXTURE0+v)}let De={[Rn]:i.REPEAT,[_n]:i.CLAMP_TO_EDGE,[_s]:i.MIRRORED_REPEAT},St={[vt]:i.NEAREST,[mo]:i.NEAREST_MIPMAP_NEAREST,[Zi]:i.NEAREST_MIPMAP_LINEAR,[ut]:i.LINEAR,[zs]:i.LINEAR_MIPMAP_NEAREST,[an]:i.LINEAR_MIPMAP_LINEAR},Pe={[Jh]:i.NEVER,[vc]:i.ALWAYS,[Qh]:i.LESS,[xc]:i.LEQUAL,[$h]:i.EQUAL,[yc]:i.GEQUAL,[ed]:i.GREATER,[td]:i.NOTEQUAL};function et(R,v){if(v.type===fn&&e.has("OES_texture_float_linear")===!1&&(v.magFilter===ut||v.magFilter===zs||v.magFilter===Zi||v.magFilter===an||v.minFilter===ut||v.minFilter===zs||v.minFilter===Zi||v.minFilter===an)&&be("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(R,i.TEXTURE_WRAP_S,De[v.wrapS]),i.texParameteri(R,i.TEXTURE_WRAP_T,De[v.wrapT]),(R===i.TEXTURE_3D||R===i.TEXTURE_2D_ARRAY)&&i.texParameteri(R,i.TEXTURE_WRAP_R,De[v.wrapR]),i.texParameteri(R,i.TEXTURE_MAG_FILTER,St[v.magFilter]),i.texParameteri(R,i.TEXTURE_MIN_FILTER,St[v.minFilter]),v.compareFunction&&(i.texParameteri(R,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(R,i.TEXTURE_COMPARE_FUNC,Pe[v.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(v.magFilter===vt||v.minFilter!==Zi&&v.minFilter!==an||v.type===fn&&e.has("OES_texture_float_linear")===!1)return;if(v.anisotropy>1||n.get(v).__currentAnisotropy){let z=e.get("EXT_texture_filter_anisotropic");i.texParameterf(R,z.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(v.anisotropy,s.getMaxAnisotropy())),n.get(v).__currentAnisotropy=v.anisotropy}}}function nt(R,v){let z=!1;R.__webglInit===void 0&&(R.__webglInit=!0,v.addEventListener("dispose",P),N(v));let te=v.source,J=f.get(te);J===void 0&&(J={},f.set(te,J));let se=j(v);if(se!==R.__cacheKey){J[se]===void 0&&(J[se]={texture:i.createTexture(),usedTimes:0},a.memory.textures++,z=!0),J[se].usedTimes++;let ue=J[R.__cacheKey];ue!==void 0&&(J[R.__cacheKey].usedTimes--,ue.usedTimes===0&&V(v)),R.__cacheKey=se,R.__webglTexture=J[se].texture}return z}function qe(R,v,z){return Math.floor(Math.floor(R/z)/v)}function Ot(R,v,z,te){let se=R.updateRanges;if(se.length===0)t.texSubImage2D(i.TEXTURE_2D,0,0,0,v.width,v.height,z,te,v.data);else{se.sort((I,Y)=>I.start-Y.start);let ue=0;for(let I=1;I<se.length;I++){let Y=se[ue],X=se[I],oe=Y.start+Y.count,ie=qe(X.start,v.width,4),re=qe(Y.start,v.width,4);X.start<=oe+1&&ie===re&&qe(X.start+X.count-1,v.width,4)===ie?Y.count=Math.max(Y.count,X.start+X.count-Y.start):(++ue,se[ue]=X)}se.length=ue+1;let K=t.getParameter(i.UNPACK_ROW_LENGTH),Z=t.getParameter(i.UNPACK_SKIP_PIXELS),ae=t.getParameter(i.UNPACK_SKIP_ROWS);t.pixelStorei(i.UNPACK_ROW_LENGTH,v.width);for(let I=0,Y=se.length;I<Y;I++){let X=se[I],oe=Math.floor(X.start/4),ie=Math.ceil(X.count/4),re=oe%v.width,we=Math.floor(oe/v.width),ze=ie,ne=1;t.pixelStorei(i.UNPACK_SKIP_PIXELS,re),t.pixelStorei(i.UNPACK_SKIP_ROWS,we),t.texSubImage2D(i.TEXTURE_2D,0,re,we,ze,ne,z,te,v.data)}R.clearUpdateRanges(),t.pixelStorei(i.UNPACK_ROW_LENGTH,K),t.pixelStorei(i.UNPACK_SKIP_PIXELS,Z),t.pixelStorei(i.UNPACK_SKIP_ROWS,ae)}}function wt(R,v,z){let te=i.TEXTURE_2D;(v.isDataArrayTexture||v.isCompressedArrayTexture)&&(te=i.TEXTURE_2D_ARRAY),v.isData3DTexture&&(te=i.TEXTURE_3D);let J=nt(R,v),se=v.source;t.bindTexture(te,R.__webglTexture,i.TEXTURE0+z);let ue=n.get(se);if(se.version!==ue.__version||J===!0){if(t.activeTexture(i.TEXTURE0+z),(typeof ImageBitmap<"u"&&v.image instanceof ImageBitmap)===!1){let ne=Ve.getPrimaries(Ve.workingColorSpace),Ae=v.colorSpace===ci?null:Ve.getPrimaries(v.colorSpace),Be=v.colorSpace===ci||ne===Ae?i.NONE:i.BROWSER_DEFAULT_WEBGL;t.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,v.flipY),t.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,v.premultiplyAlpha),t.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,Be)}t.pixelStorei(i.UNPACK_ALIGNMENT,v.unpackAlignment);let Z=y(v.image,!1,s.maxTextureSize);Z=Ce(v,Z);let ae=r.convert(v.format,v.colorSpace),I=r.convert(v.type),Y=E(v.internalFormat,ae,I,v.normalized,v.colorSpace,v.isVideoTexture);et(te,v);let X,oe=v.mipmaps,ie=v.isVideoTexture!==!0,re=ue.__version===void 0||J===!0,we=se.dataReady,ze=T(v,Z);if(v.isDepthTexture)Y=x(v.format===li,v.type),re&&(ie?t.texStorage2D(i.TEXTURE_2D,1,Y,Z.width,Z.height):t.texImage2D(i.TEXTURE_2D,0,Y,Z.width,Z.height,0,ae,I,null));else if(v.isDataTexture)if(oe.length>0){ie&&re&&t.texStorage2D(i.TEXTURE_2D,ze,Y,oe[0].width,oe[0].height);for(let ne=0,Ae=oe.length;ne<Ae;ne++)X=oe[ne],ie?we&&t.texSubImage2D(i.TEXTURE_2D,ne,0,0,X.width,X.height,ae,I,X.data):t.texImage2D(i.TEXTURE_2D,ne,Y,X.width,X.height,0,ae,I,X.data);v.generateMipmaps=!1}else ie?(re&&t.texStorage2D(i.TEXTURE_2D,ze,Y,Z.width,Z.height),we&&Ot(v,Z,ae,I)):t.texImage2D(i.TEXTURE_2D,0,Y,Z.width,Z.height,0,ae,I,Z.data);else if(v.isCompressedTexture)if(v.isCompressedArrayTexture){ie&&re&&t.texStorage3D(i.TEXTURE_2D_ARRAY,ze,Y,oe[0].width,oe[0].height,Z.depth);for(let ne=0,Ae=oe.length;ne<Ae;ne++)if(X=oe[ne],v.format!==ln)if(ae!==null)if(ie){if(we)if(v.layerUpdates.size>0){let Be=Cc(X.width,X.height,v.format,v.type);for(let pe of v.layerUpdates){let tt=X.data.subarray(pe*Be/X.data.BYTES_PER_ELEMENT,(pe+1)*Be/X.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,ne,0,0,pe,X.width,X.height,1,ae,tt)}}else t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,ne,0,0,0,X.width,X.height,Z.depth,ae,X.data)}else t.compressedTexImage3D(i.TEXTURE_2D_ARRAY,ne,Y,X.width,X.height,Z.depth,0,X.data,0,0);else be("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else ie?we&&t.texSubImage3D(i.TEXTURE_2D_ARRAY,ne,0,0,0,X.width,X.height,Z.depth,ae,I,X.data):t.texImage3D(i.TEXTURE_2D_ARRAY,ne,Y,X.width,X.height,Z.depth,0,ae,I,X.data);v.layerUpdates.size>0&&v.clearLayerUpdates()}else{ie&&re&&t.texStorage2D(i.TEXTURE_2D,ze,Y,oe[0].width,oe[0].height);for(let ne=0,Ae=oe.length;ne<Ae;ne++)X=oe[ne],v.format!==ln?ae!==null?ie?we&&t.compressedTexSubImage2D(i.TEXTURE_2D,ne,0,0,X.width,X.height,ae,X.data):t.compressedTexImage2D(i.TEXTURE_2D,ne,Y,X.width,X.height,0,X.data):be("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):ie?we&&t.texSubImage2D(i.TEXTURE_2D,ne,0,0,X.width,X.height,ae,I,X.data):t.texImage2D(i.TEXTURE_2D,ne,Y,X.width,X.height,0,ae,I,X.data)}else if(v.isDataArrayTexture)if(ie){if(re&&t.texStorage3D(i.TEXTURE_2D_ARRAY,ze,Y,Z.width,Z.height,Z.depth),we)if(v.layerUpdates.size>0){let ne=Cc(Z.width,Z.height,v.format,v.type);for(let Ae of v.layerUpdates){let Be=Z.data.subarray(Ae*ne/Z.data.BYTES_PER_ELEMENT,(Ae+1)*ne/Z.data.BYTES_PER_ELEMENT);t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,Ae,Z.width,Z.height,1,ae,I,Be)}v.clearLayerUpdates()}else t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,Z.width,Z.height,Z.depth,ae,I,Z.data)}else t.texImage3D(i.TEXTURE_2D_ARRAY,0,Y,Z.width,Z.height,Z.depth,0,ae,I,Z.data);else if(v.isData3DTexture)ie?(re&&t.texStorage3D(i.TEXTURE_3D,ze,Y,Z.width,Z.height,Z.depth),we&&t.texSubImage3D(i.TEXTURE_3D,0,0,0,0,Z.width,Z.height,Z.depth,ae,I,Z.data)):t.texImage3D(i.TEXTURE_3D,0,Y,Z.width,Z.height,Z.depth,0,ae,I,Z.data);else if(v.isFramebufferTexture){if(re)if(ie)t.texStorage2D(i.TEXTURE_2D,ze,Y,Z.width,Z.height);else{let ne=Z.width,Ae=Z.height;for(let Be=0;Be<ze;Be++)t.texImage2D(i.TEXTURE_2D,Be,Y,ne,Ae,0,ae,I,null),ne>>=1,Ae>>=1}}else if(v.isHTMLTexture){if("texElementImage2D"in i){let ne=i.canvas;if(ne.hasAttribute("layoutsubtree")||ne.setAttribute("layoutsubtree","true"),Z.parentNode!==ne){ne.appendChild(Z),h.add(v),ne.onpaint=Ae=>{let Be=Ae.changedElements;for(let pe of h)Be.includes(pe.image)&&(pe.needsUpdate=!0)},ne.requestPaint();return}if(i.texElementImage2D.length===3)i.texElementImage2D(i.TEXTURE_2D,i.RGBA8,Z);else{let Be=i.RGBA,pe=i.RGBA,tt=i.UNSIGNED_BYTE;i.texElementImage2D(i.TEXTURE_2D,0,Be,pe,tt,Z)}i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE)}}else if(oe.length>0){if(ie&&re){let ne=Oe(oe[0]);t.texStorage2D(i.TEXTURE_2D,ze,Y,ne.width,ne.height)}for(let ne=0,Ae=oe.length;ne<Ae;ne++)X=oe[ne],ie?we&&t.texSubImage2D(i.TEXTURE_2D,ne,0,0,ae,I,X):t.texImage2D(i.TEXTURE_2D,ne,Y,ae,I,X);v.generateMipmaps=!1}else if(ie){if(re){let ne=Oe(Z);t.texStorage2D(i.TEXTURE_2D,ze,Y,ne.width,ne.height)}we&&t.texSubImage2D(i.TEXTURE_2D,0,0,0,ae,I,Z)}else t.texImage2D(i.TEXTURE_2D,0,Y,ae,I,Z);w(v)&&v.mipmapsAutoUpdate===!0&&M(te),ue.__version=se.version,v.onUpdate&&v.onUpdate(v)}R.__version=v.version}function $t(R,v,z){if(v.image.length!==6)return;let te=nt(R,v),J=v.source;t.bindTexture(i.TEXTURE_CUBE_MAP,R.__webglTexture,i.TEXTURE0+z);let se=n.get(J);if(J.version!==se.__version||te===!0){t.activeTexture(i.TEXTURE0+z);let ue=Ve.getPrimaries(Ve.workingColorSpace),K=v.colorSpace===ci?null:Ve.getPrimaries(v.colorSpace),Z=v.colorSpace===ci||ue===K?i.NONE:i.BROWSER_DEFAULT_WEBGL;t.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,v.flipY),t.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,v.premultiplyAlpha),t.pixelStorei(i.UNPACK_ALIGNMENT,v.unpackAlignment),t.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,Z);let ae=v.isCompressedTexture||v.image[0].isCompressedTexture,I=v.image[0]&&v.image[0].isDataTexture,Y=[];for(let pe=0;pe<6;pe++)!ae&&!I?Y[pe]=y(v.image[pe],!0,s.maxCubemapSize):Y[pe]=I?v.image[pe].image:v.image[pe],Y[pe]=Ce(v,Y[pe]);let X=Y[0],oe=r.convert(v.format,v.colorSpace),ie=r.convert(v.type),re=E(v.internalFormat,oe,ie,v.normalized,v.colorSpace),we=v.isVideoTexture!==!0,ze=se.__version===void 0||te===!0,ne=J.dataReady,Ae=T(v,X);et(i.TEXTURE_CUBE_MAP,v);let Be;if(v.isDepthTexture){if(re=x(v.format===li,v.type),ze)if(we)t.texStorage2D(i.TEXTURE_CUBE_MAP,1,re,X.width,X.height);else for(let pe=0;pe<6;pe++)t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+pe,0,re,X.width,X.height,0,oe,ie,null)}else if(ae){we&&ze&&t.texStorage2D(i.TEXTURE_CUBE_MAP,Ae,re,X.width,X.height);for(let pe=0;pe<6;pe++){Be=Y[pe].mipmaps;for(let tt=0;tt<Be.length;tt++){let Nt=Be[tt];v.format!==ln?oe!==null?we?ne&&t.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+pe,tt,0,0,Nt.width,Nt.height,oe,Nt.data):t.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+pe,tt,re,Nt.width,Nt.height,0,Nt.data):be("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):we?ne&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+pe,tt,0,0,Nt.width,Nt.height,oe,ie,Nt.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+pe,tt,re,Nt.width,Nt.height,0,oe,ie,Nt.data)}}}else{if(Be=v.mipmaps,we&&ze){Be.length>0&&Ae++;let pe=Oe(Y[0]);t.texStorage2D(i.TEXTURE_CUBE_MAP,Ae,re,pe.width,pe.height)}for(let pe=0;pe<6;pe++)if(I){we?ne&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+pe,0,0,0,Y[pe].width,Y[pe].height,oe,ie,Y[pe].data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+pe,0,re,Y[pe].width,Y[pe].height,0,oe,ie,Y[pe].data);for(let tt=0;tt<Be.length;tt++){let hi=Be[tt].image[pe].image;we?ne&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+pe,tt+1,0,0,hi.width,hi.height,oe,ie,hi.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+pe,tt+1,re,hi.width,hi.height,0,oe,ie,hi.data)}}else{we?ne&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+pe,0,0,0,oe,ie,Y[pe]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+pe,0,re,oe,ie,Y[pe]);for(let tt=0;tt<Be.length;tt++){let Nt=Be[tt];we?ne&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+pe,tt+1,0,0,oe,ie,Nt.image[pe]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+pe,tt+1,re,oe,ie,Nt.image[pe])}}}w(v)&&v.mipmapsAutoUpdate===!0&&M(i.TEXTURE_CUBE_MAP),se.__version=J.version,v.onUpdate&&v.onUpdate(v)}R.__version=v.version}function lt(R,v,z,te,J,se){let ue=r.convert(z.format,z.colorSpace),K=r.convert(z.type),Z=E(z.internalFormat,ue,K,z.normalized,z.colorSpace),ae=n.get(v),I=n.get(z);if(I.__renderTarget=v,!ae.__hasExternalTextures){let Y=Math.max(1,v.width>>se),X=Math.max(1,v.height>>se);J===i.TEXTURE_3D||J===i.TEXTURE_2D_ARRAY?t.texImage3D(J,se,Z,Y,X,v.depth,0,ue,K,null):t.texImage2D(J,se,Z,Y,X,0,ue,K,null)}t.bindFramebuffer(i.FRAMEBUFFER,R),de(v)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,te,J,I.__webglTexture,0,ot(v)):(J===i.TEXTURE_2D||J>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&J<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,te,J,I.__webglTexture,se),t.bindFramebuffer(i.FRAMEBUFFER,null)}function Pn(R,v,z){if(i.bindRenderbuffer(i.RENDERBUFFER,R),v.depthBuffer){let te=v.depthTexture,J=te&&te.isDepthTexture?te.type:null,se=x(v.stencilBuffer,J),ue=v.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;de(v)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,ot(v),se,v.width,v.height):z?i.renderbufferStorageMultisample(i.RENDERBUFFER,ot(v),se,v.width,v.height):i.renderbufferStorage(i.RENDERBUFFER,se,v.width,v.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,ue,i.RENDERBUFFER,R)}else{let te=v.textures;for(let J=0;J<te.length;J++){let se=te[J],ue=r.convert(se.format,se.colorSpace),K=r.convert(se.type),Z=E(se.internalFormat,ue,K,se.normalized,se.colorSpace);de(v)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,ot(v),Z,v.width,v.height):z?i.renderbufferStorageMultisample(i.RENDERBUFFER,ot(v),Z,v.width,v.height):i.renderbufferStorage(i.RENDERBUFFER,Z,v.width,v.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function Pt(R,v,z){let te=v.isWebGLCubeRenderTarget===!0;if(t.bindFramebuffer(i.FRAMEBUFFER,R),!(v.depthTexture&&v.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");let J=n.get(v.depthTexture);J.__renderTarget=v;let se=te?v.depthTexture.image[0]:v.depthTexture.image;(!J.__webglTexture||se.width!==v.width||se.height!==v.height)&&(se.width=v.width,se.height=v.height,v.depthTexture.needsUpdate=!0),te?fe(v.depthTexture,0):ce(v.depthTexture,0);let ue=J.__webglTexture,K=ot(v),Z=te?i.TEXTURE_CUBE_MAP_POSITIVE_X+z:i.TEXTURE_2D,ae=v.depthTexture.format===li?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;if(v.depthTexture.format===Jn)de(v)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,ae,Z,ue,0,K):i.framebufferTexture2D(i.FRAMEBUFFER,ae,Z,ue,0);else if(v.depthTexture.format===li)de(v)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,ae,Z,ue,0,K):i.framebufferTexture2D(i.FRAMEBUFFER,ae,Z,ue,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function mn(R){let v=n.get(R),z=R.isWebGLCubeRenderTarget===!0;if(v.__boundDepthTexture!==R.depthTexture){let te=R.depthTexture;if(v.__depthDisposeCallback&&v.__depthDisposeCallback(),te){let J=()=>{delete v.__boundDepthTexture,delete v.__depthDisposeCallback,te.removeEventListener("dispose",J)};te.addEventListener("dispose",J),v.__depthDisposeCallback=J}v.__boundDepthTexture=te}if(R.depthTexture&&!v.__autoAllocateDepthBuffer)if(z)for(let te=0;te<6;te++)Pt(v.__webglFramebuffer[te],R,te);else R.texture.mipmaps.length>0?Pt(v.__webglFramebuffer[0],R,0):Pt(v.__webglFramebuffer,R,0);else if(z){v.__webglDepthbuffer=[];for(let te=0;te<6;te++)if(t.bindFramebuffer(i.FRAMEBUFFER,v.__webglFramebuffer[te]),v.__webglDepthbuffer[te]===void 0)v.__webglDepthbuffer[te]=i.createRenderbuffer(),Pn(v.__webglDepthbuffer[te],R,!1);else{let J=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,se=v.__webglDepthbuffer[te];i.bindRenderbuffer(i.RENDERBUFFER,se),i.framebufferRenderbuffer(i.FRAMEBUFFER,J,i.RENDERBUFFER,se)}}else if(R.texture.mipmaps.length>0?t.bindFramebuffer(i.FRAMEBUFFER,v.__webglFramebuffer[0]):t.bindFramebuffer(i.FRAMEBUFFER,v.__webglFramebuffer),v.__webglDepthbuffer===void 0)v.__webglDepthbuffer=i.createRenderbuffer(),Pn(v.__webglDepthbuffer,R,!1);else{let J=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,se=v.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,se),i.framebufferRenderbuffer(i.FRAMEBUFFER,J,i.RENDERBUFFER,se)}t.bindFramebuffer(i.FRAMEBUFFER,null)}function gn(R,v,z){let te=n.get(R);v!==void 0&&lt(te.__webglFramebuffer,R,R.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),z!==void 0&&mn(R)}function xn(R){let v=R.texture,z=n.get(R),te=n.get(v);R.addEventListener("dispose",F),N(R);let J=R.textures,se=R.isWebGLCubeRenderTarget===!0,ue=J.length>1;if(ue||(te.__webglTexture===void 0&&(te.__webglTexture=i.createTexture()),te.__version=v.version,a.memory.textures++),se){z.__webglFramebuffer=[];for(let K=0;K<6;K++)if(v.mipmaps.length>0){z.__webglFramebuffer[K]=[];for(let Z=0;Z<v.mipmaps.length;Z++)z.__webglFramebuffer[K][Z]=i.createFramebuffer()}else z.__webglFramebuffer[K]=i.createFramebuffer()}else{if(v.mipmaps.length>0){z.__webglFramebuffer=[];for(let K=0;K<v.mipmaps.length;K++)z.__webglFramebuffer[K]=i.createFramebuffer()}else z.__webglFramebuffer=i.createFramebuffer();if(ue)for(let K=0,Z=J.length;K<Z;K++){let ae=n.get(J[K]);ae.__webglTexture===void 0&&(ae.__webglTexture=i.createTexture(),a.memory.textures++)}if(R.samples>0&&de(R)===!1){z.__webglMultisampledFramebuffer=i.createFramebuffer(),z.__webglColorRenderbuffer=[],t.bindFramebuffer(i.FRAMEBUFFER,z.__webglMultisampledFramebuffer);for(let K=0;K<J.length;K++){let Z=J[K];z.__webglColorRenderbuffer[K]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,z.__webglColorRenderbuffer[K]);let ae=r.convert(Z.format,Z.colorSpace),I=r.convert(Z.type),Y=E(Z.internalFormat,ae,I,Z.normalized,Z.colorSpace,R.isXRRenderTarget===!0),X=ot(R);i.renderbufferStorageMultisample(i.RENDERBUFFER,X,Y,R.width,R.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+K,i.RENDERBUFFER,z.__webglColorRenderbuffer[K])}i.bindRenderbuffer(i.RENDERBUFFER,null),R.depthBuffer&&(z.__webglDepthRenderbuffer=i.createRenderbuffer(),Pn(z.__webglDepthRenderbuffer,R,!0)),t.bindFramebuffer(i.FRAMEBUFFER,null)}}if(se){t.bindTexture(i.TEXTURE_CUBE_MAP,te.__webglTexture),et(i.TEXTURE_CUBE_MAP,v);for(let K=0;K<6;K++)if(v.mipmaps.length>0)for(let Z=0;Z<v.mipmaps.length;Z++)lt(z.__webglFramebuffer[K][Z],R,v,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+K,Z);else lt(z.__webglFramebuffer[K],R,v,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+K,0);w(v)?M(i.TEXTURE_CUBE_MAP):v.mipmaps.length>0&&i.texParameteri(i.TEXTURE_CUBE_MAP,i.TEXTURE_MAX_LEVEL,v.mipmaps.length-1),t.unbindTexture()}else if(ue){for(let K=0,Z=J.length;K<Z;K++){let ae=J[K],I=n.get(ae),Y=i.TEXTURE_2D;(R.isWebGL3DRenderTarget||R.isWebGLArrayRenderTarget)&&(Y=R.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),t.bindTexture(Y,I.__webglTexture),et(Y,ae),lt(z.__webglFramebuffer,R,ae,i.COLOR_ATTACHMENT0+K,Y,0),w(ae)&&M(Y)}t.unbindTexture()}else{let K=i.TEXTURE_2D;if((R.isWebGL3DRenderTarget||R.isWebGLArrayRenderTarget)&&(K=R.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),t.bindTexture(K,te.__webglTexture),et(K,v),v.mipmaps.length>0)for(let Z=0;Z<v.mipmaps.length;Z++)lt(z.__webglFramebuffer[Z],R,v,i.COLOR_ATTACHMENT0,K,Z);else lt(z.__webglFramebuffer,R,v,i.COLOR_ATTACHMENT0,K,0);w(v)?M(K):v.mipmaps.length>0&&i.texParameteri(K,i.TEXTURE_MAX_LEVEL,v.mipmaps.length-1),t.unbindTexture()}R.depthBuffer&&mn(R)}function O(R){let v=R.textures;for(let z=0,te=v.length;z<te;z++){let J=v[z];if(w(J)&&J.mipmapsAutoUpdate===!0){let se=b(R),ue=n.get(J).__webglTexture;t.bindTexture(se,ue),M(se),t.unbindTexture()}}}let yn=[];function at(R){if(R.samples>0){if(de(R)===!1){let v=R.textures,z=R.width,te=R.height,J=i.COLOR_BUFFER_BIT,se=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,ue=n.get(R),K=v.length>1;if(K)for(let ae=0;ae<v.length;ae++)t.bindFramebuffer(i.FRAMEBUFFER,ue.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+ae,i.RENDERBUFFER,null),t.bindFramebuffer(i.FRAMEBUFFER,ue.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+ae,i.TEXTURE_2D,null,0);t.bindFramebuffer(i.READ_FRAMEBUFFER,ue.__webglMultisampledFramebuffer),R.texture.mipmaps.length>0?t.bindFramebuffer(i.DRAW_FRAMEBUFFER,ue.__webglFramebuffer[0]):t.bindFramebuffer(i.DRAW_FRAMEBUFFER,ue.__webglFramebuffer);for(let ae=0;ae<v.length;ae++){if(R.resolveDepthBuffer&&(R.depthBuffer&&(J|=i.DEPTH_BUFFER_BIT),R.stencilBuffer&&R.resolveStencilBuffer&&(J|=i.STENCIL_BUFFER_BIT)),K){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,ue.__webglColorRenderbuffer[ae]);let I=n.get(v[ae]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,I,0)}i.blitFramebuffer(0,0,z,te,0,0,z,te,J,i.NEAREST),l===!0&&(yn.length=0,yn.push(i.COLOR_ATTACHMENT0+ae),R.depthBuffer&&R.storeMultisampledDepthBuffer===!1&&yn.push(se),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,yn))}if(t.bindFramebuffer(i.READ_FRAMEBUFFER,null),t.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),K)for(let ae=0;ae<v.length;ae++){t.bindFramebuffer(i.FRAMEBUFFER,ue.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+ae,i.RENDERBUFFER,ue.__webglColorRenderbuffer[ae]);let I=n.get(v[ae]).__webglTexture;t.bindFramebuffer(i.FRAMEBUFFER,ue.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+ae,i.TEXTURE_2D,I,0)}t.bindFramebuffer(i.DRAW_FRAMEBUFFER,ue.__webglMultisampledFramebuffer)}else if(R.depthBuffer&&R.storeMultisampledDepthBuffer===!1&&l){let v=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[v])}}}function ot(R){return Math.min(s.maxSamples,R.samples)}function de(R){let v=n.get(R);return R.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&v.__useRenderToTexture!==!1}function Et(R){let v=a.render.frame;u.get(R)!==v&&(u.set(R,v),R.update())}function Ce(R,v){let z=R.colorSpace,te=R.format,J=R.type;return R.isCompressedTexture===!0||R.isVideoTexture===!0||z!==Yt&&z!==ci&&(Ve.getTransfer(z)===Je?(te!==ln||J!==on)&&be("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):Ne("WebGLTextures: Unsupported texture color space:",z)),v}function Oe(R){return typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement?(c.width=R.naturalWidth||R.width,c.height=R.naturalHeight||R.height):typeof VideoFrame<"u"&&R instanceof VideoFrame?(c.width=R.displayWidth,c.height=R.displayHeight):(c.width=R.width,c.height=R.height),c}this.allocateTextureUnit=Ie,this.resetTextureUnits=Q,this.getTextureUnits=ee,this.setTextureUnits=ve,this.setTexture2D=ce,this.setTexture2DArray=xe,this.setTexture3D=Re,this.setTextureCube=fe,this.rebindTextures=gn,this.setupRenderTarget=xn,this.updateRenderTargetMipmap=O,this.updateMultisampleRenderTarget=at,this.setupDepthRenderbuffer=mn,this.setupFrameBufferTexture=lt,this.useMultisampledRTT=de,this.dispose=U}function Kx(i,e){function t(n,s=ci){let r,a=Ve.getTransfer(s);if(n===on)return i.UNSIGNED_BYTE;if(n===xo)return i.UNSIGNED_SHORT_4_4_4_4;if(n===yo)return i.UNSIGNED_SHORT_5_5_5_1;if(n===dc)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===fc)return i.UNSIGNED_INT_10F_11F_11F_REV;if(n===uc)return i.BYTE;if(n===hc)return i.SHORT;if(n===Gs)return i.UNSIGNED_SHORT;if(n===go)return i.INT;if(n===Cn)return i.UNSIGNED_INT;if(n===fn)return i.FLOAT;if(n===_t)return i.HALF_FLOAT;if(n===pc)return i.ALPHA;if(n===mc)return i.RGB;if(n===ln)return i.RGBA;if(n===Jn)return i.DEPTH_COMPONENT;if(n===li)return i.DEPTH_STENCIL;if(n===Hs)return i.RED;if(n===vo)return i.RED_INTEGER;if(n===wi)return i.RG;if(n===_o)return i.RG_INTEGER;if(n===So)return i.RGBA_INTEGER;if(n===Xr||n===Kr||n===jr||n===Zr)if(a===Je)if(r=e.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===Xr)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Kr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===jr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Zr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=e.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===Xr)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Kr)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===jr)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Zr)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===Mo||n===bo||n===To||n===wo)if(r=e.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===Mo)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===bo)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===To)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===wo)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===Eo||n===Ao||n===Ro||n===Co||n===Io||n===Yr||n===Po)if(r=e.get("WEBGL_compressed_texture_etc"),r!==null){if(n===Eo||n===Ao)return a===Je?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===Ro)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(n===Co)return r.COMPRESSED_R11_EAC;if(n===Io)return r.COMPRESSED_SIGNED_R11_EAC;if(n===Yr)return r.COMPRESSED_RG11_EAC;if(n===Po)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===No||n===Lo||n===Uo||n===Do||n===Oo||n===Fo||n===Bo||n===Vo||n===ko||n===zo||n===Go||n===Ho||n===Wo||n===qo)if(r=e.get("WEBGL_compressed_texture_astc"),r!==null){if(n===No)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===Lo)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===Uo)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===Do)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===Oo)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===Fo)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===Bo)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===Vo)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===ko)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===zo)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===Go)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===Ho)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===Wo)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===qo)return a===Je?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===Xo||n===Ko||n===jo)if(r=e.get("EXT_texture_compression_bptc"),r!==null){if(n===Xo)return a===Je?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===Ko)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===jo)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Zo||n===Yo||n===Jr||n===Jo)if(r=e.get("EXT_texture_compression_rgtc"),r!==null){if(n===Zo)return r.COMPRESSED_RED_RGTC1_EXT;if(n===Yo)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===Jr)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===Jo)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===Yi?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:t}}var jx=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Zx=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,Bc=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let n=new Ar(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,n=new dt({vertexShader:jx,fragmentShader:Zx,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new je(new ki(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},Vc=class extends Un{constructor(e,t){super();let n=this,s=null,r=1,a=null,o="local-floor",l=1,c=null,u=null,h=null,d=null,f=null,g=null,_=typeof XRWebGLBinding<"u",m=new Bc,p={},y=t.getContextAttributes(),w=null,M=null,b=[],E=[],x=new Ee,T=null,N=null,C=new Tt;C.viewport=new Ye;let P=new Tt;P.viewport=new Ye;let F=[C,P],G=new co,A=null,U=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(j){let ce=b[j];return ce===void 0&&(ce=new As,b[j]=ce),ce.getTargetRaySpace()},this.getControllerGrip=function(j){let ce=b[j];return ce===void 0&&(ce=new As,b[j]=ce),ce.getGripSpace()},this.getHand=function(j){let ce=b[j];return ce===void 0&&(ce=new As,b[j]=ce),ce.getHandSpace()};function B(j){let ce=E.indexOf(j.inputSource);if(ce===-1)return;let xe=b[ce];xe!==void 0&&(xe.update(j.inputSource,j.frame,c||a),xe.dispatchEvent({type:j.type,data:j.inputSource}))}function V(){s.removeEventListener("select",B),s.removeEventListener("selectstart",B),s.removeEventListener("selectend",B),s.removeEventListener("squeeze",B),s.removeEventListener("squeezestart",B),s.removeEventListener("squeezeend",B),s.removeEventListener("end",V),s.removeEventListener("inputsourceschange",$);for(let j=0;j<b.length;j++){let ce=E[j];ce!==null&&(E[j]=null,b[j].disconnect(ce))}A=null,U=null,m.reset();for(let j in p)delete p[j];if(e.setRenderTarget(w),f=null,d=null,h=null,s=null,M=null,Ie.stop(),n.isPresenting=!1,e.setPixelRatio(T),e.setSize(x.width,x.height,!1),N!==null){let j=N.camera;j.fov=N.fov,j.zoom=N.zoom,j.updateProjectionMatrix(),N=null}n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(j){r=j,n.isPresenting===!0&&be("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(j){o=j,n.isPresenting===!0&&be("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(j){c=j},this.getBaseLayer=function(){return d!==null?d:f},this.getBinding=function(){return h===null&&_&&(h=new XRWebGLBinding(s,t)),h},this.getFrame=function(){return g},this.getSession=function(){return s},this.setSession=async function(j){if(s=j,s!==null){if(w=e.getRenderTarget(),s.addEventListener("select",B),s.addEventListener("selectstart",B),s.addEventListener("selectend",B),s.addEventListener("squeeze",B),s.addEventListener("squeezestart",B),s.addEventListener("squeezeend",B),s.addEventListener("end",V),s.addEventListener("inputsourceschange",$),y.xrCompatible!==!0&&await t.makeXRCompatible(),T=e.getPixelRatio(),e.getSize(x),_&&"createProjectionLayer"in XRWebGLBinding.prototype){let xe=null,Re=null,fe=null;y.depth&&(fe=y.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,xe=y.stencil?li:Jn,Re=y.stencil?Yi:Cn);let De={colorFormat:t.RGBA8,depthFormat:fe,scaleFactor:r};h=this.getBinding(),d=h.createProjectionLayer(De),s.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),M=new mt(d.textureWidth,d.textureHeight,{format:ln,type:on,depthTexture:new ei(d.textureWidth,d.textureHeight,Re,void 0,void 0,void 0,void 0,void 0,void 0,xe),stencilBuffer:y.stencil,colorSpace:e.outputColorSpace,samples:y.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1,storeMultisampledDepthBuffer:d.ignoreDepthValues===!1,storeMultisampledStencilBuffer:d.ignoreDepthValues===!1})}else{let xe={antialias:y.antialias,alpha:!0,depth:y.depth,stencil:y.stencil,framebufferScaleFactor:r};f=new XRWebGLLayer(s,t,xe),s.updateRenderState({baseLayer:f}),e.setPixelRatio(1),e.setSize(f.framebufferWidth,f.framebufferHeight,!1),M=new mt(f.framebufferWidth,f.framebufferHeight,{format:ln,type:on,colorSpace:e.outputColorSpace,stencilBuffer:y.stencil,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1,storeMultisampledDepthBuffer:f.ignoreDepthValues===!1,storeMultisampledStencilBuffer:f.ignoreDepthValues===!1})}M.isXRRenderTarget=!0,this.setFoveation(l),c=null,a=await s.requestReferenceSpace(o),Ie.setContext(s),Ie.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return m.getDepthTexture()};function $(j){for(let ce=0;ce<j.removed.length;ce++){let xe=j.removed[ce],Re=E.indexOf(xe);Re>=0&&(E[Re]=null,b[Re].disconnect(xe))}for(let ce=0;ce<j.added.length;ce++){let xe=j.added[ce],Re=E.indexOf(xe);if(Re===-1){for(let De=0;De<b.length;De++)if(De>=E.length){E.push(xe),Re=De;break}else if(E[De]===null){E[De]=xe,Re=De;break}if(Re===-1)break}let fe=b[Re];fe&&fe.connect(xe)}}function q(j,ce){ce===null?j.matrixWorld.copy(j.matrix):j.matrixWorld.multiplyMatrices(ce.matrixWorld,j.matrix),j.matrixWorldInverse.copy(j.matrixWorld).invert()}this.updateCamera=function(j){if(s===null)return;let ce=j.near,xe=j.far;m.texture!==null&&(m.depthNear>0&&(ce=m.depthNear),m.depthFar>0&&(xe=m.depthFar)),G.near=P.near=C.near=ce,G.far=P.far=C.far=xe,(A!==G.near||U!==G.far)&&(s.updateRenderState({depthNear:G.near,depthFar:G.far}),A=G.near,U=G.far),G.layers.mask=j.layers.mask|6,C.layers.mask=G.layers.mask&-5,P.layers.mask=G.layers.mask&-3;let Re=j.parent,fe=G.cameras;q(G,Re);for(let De=0;De<fe.length;De++)q(fe[De],Re);G.projectionMatrix.copy(C.projectionMatrix),G.projectionMatrixInverse.copy(C.projectionMatrixInverse),N===null&&j.isPerspectiveCamera&&(N={camera:j,fov:j.fov,zoom:j.zoom}),Q(j,G,Re)};function Q(j,ce,xe){xe===null?j.matrix.copy(ce.matrixWorld):(j.matrix.copy(xe.matrixWorld),j.matrix.invert(),j.matrix.multiply(ce.matrixWorld)),j.matrix.decompose(j.position,j.quaternion,j.scale),j.updateMatrixWorld(!0),j.projectionMatrix.copy(ce.projectionMatrix),j.projectionMatrixInverse.copy(ce.projectionMatrixInverse),j.isPerspectiveCamera&&(j.fov=Bi*2*Math.atan(1/j.projectionMatrix.elements[5]),j.zoom=1)}this.getCamera=function(){return G},this.getFoveation=function(){if(!(d===null&&f===null))return l},this.setFoveation=function(j){l=j,d!==null&&(d.fixedFoveation=j),f!==null&&f.fixedFoveation!==void 0&&(f.fixedFoveation=j)},this.hasDepthSensing=function(){return m.texture!==null},this.getDepthSensingMesh=function(){return m.getMesh(G)},this.getCameraTexture=function(j){return p[j]};let ee=null;function ve(j,ce){if(u=ce.getViewerPose(c||a),g=ce,u!==null){let xe=u.views;f!==null&&(e.setRenderTargetFramebuffer(M,f.framebuffer),e.setRenderTarget(M));let Re=!1;xe.length!==G.cameras.length&&(G.cameras.length=0,Re=!0);for(let Pe=0;Pe<xe.length;Pe++){let et=xe[Pe],nt=null;if(f!==null)nt=f.getViewport(et);else{let Ot=h.getViewSubImage(d,et);nt=Ot.viewport,Pe===0&&(e.setRenderTargetTextures(M,Ot.colorTexture,Ot.depthStencilTexture),e.setRenderTarget(M))}let qe=F[Pe];qe===void 0&&(qe=new Tt,qe.layers.enable(Pe),qe.viewport=new Ye,F[Pe]=qe),qe.matrix.fromArray(et.transform.matrix),qe.matrix.decompose(qe.position,qe.quaternion,qe.scale),qe.projectionMatrix.fromArray(et.projectionMatrix),qe.projectionMatrixInverse.copy(qe.projectionMatrix).invert(),qe.viewport.set(nt.x,nt.y,nt.width,nt.height),Pe===0&&(G.matrix.copy(qe.matrix),G.matrix.decompose(G.position,G.quaternion,G.scale)),Re===!0&&G.cameras.push(qe)}let fe=s.enabledFeatures;if(fe&&fe.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&_){h=n.getBinding();let Pe=h.getDepthInformation(xe[0]);Pe&&Pe.isValid&&Pe.texture&&m.init(Pe,s.renderState)}if(fe&&fe.includes("camera-access")&&_){e.state.unbindTexture(),h=n.getBinding();for(let Pe=0;Pe<xe.length;Pe++){let et=xe[Pe].camera;if(et){let nt=p[et];nt||(nt=new Ar,p[et]=nt);let qe=h.getCameraImage(et);nt.sourceTexture=qe}}}}for(let xe=0;xe<b.length;xe++){let Re=E[xe],fe=b[xe];Re!==null&&fe!==void 0&&fe.update(Re,ce,c||a)}ee&&ee(j,ce),ce.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:ce}),g=null}let Ie=new Id;Ie.setAnimationLoop(ve),this.setAnimationLoop=function(j){ee=j},this.dispose=function(){}}},Yx=new Le,kd=new Ue;kd.set(-1,0,0,0,1,0,0,0,1);function Jx(i,e){function t(m,p){m.matrixAutoUpdate===!0&&m.updateMatrix(),p.value.copy(m.matrix)}function n(m,p){p.color.getRGB(m.fogColor.value,Ec(i)),p.isFog?(m.fogNear.value=p.near,m.fogFar.value=p.far):p.isFogExp2&&(m.fogDensity.value=p.density)}function s(m,p,y,w,M){p.isNodeMaterial?p.uniformsNeedUpdate=!1:p.isMeshBasicMaterial?r(m,p):p.isMeshLambertMaterial?(r(m,p),p.envMap&&(m.envMapIntensity.value=p.envMapIntensity)):p.isMeshToonMaterial?(r(m,p),h(m,p)):p.isMeshPhongMaterial?(r(m,p),u(m,p),p.envMap&&(m.envMapIntensity.value=p.envMapIntensity)):p.isMeshStandardMaterial?(r(m,p),d(m,p),p.isMeshPhysicalMaterial&&f(m,p,M)):p.isMeshMatcapMaterial?(r(m,p),g(m,p)):p.isMeshDepthMaterial?r(m,p):p.isMeshDistanceMaterial?(r(m,p),_(m,p)):p.isMeshNormalMaterial?r(m,p):p.isLineBasicMaterial?(a(m,p),p.isLineDashedMaterial&&o(m,p)):p.isPointsMaterial?l(m,p,y,w):p.isSpriteMaterial?c(m,p):p.isShadowMaterial?(m.color.value.copy(p.color),m.opacity.value=p.opacity):p.isShaderMaterial&&(p.uniformsNeedUpdate=!1)}function r(m,p){m.opacity.value=p.opacity,p.color&&m.diffuse.value.copy(p.color),p.emissive&&m.emissive.value.copy(p.emissive).multiplyScalar(p.emissiveIntensity),p.map&&(m.map.value=p.map,t(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.bumpMap&&(m.bumpMap.value=p.bumpMap,t(p.bumpMap,m.bumpMapTransform),m.bumpScale.value=p.bumpScale,p.side===Rt&&(m.bumpScale.value*=-1)),p.normalMap&&(m.normalMap.value=p.normalMap,t(p.normalMap,m.normalMapTransform),m.normalScale.value.copy(p.normalScale),p.side===Rt&&m.normalScale.value.negate()),p.displacementMap&&(m.displacementMap.value=p.displacementMap,t(p.displacementMap,m.displacementMapTransform),m.displacementScale.value=p.displacementScale,m.displacementBias.value=p.displacementBias),p.emissiveMap&&(m.emissiveMap.value=p.emissiveMap,t(p.emissiveMap,m.emissiveMapTransform)),p.specularMap&&(m.specularMap.value=p.specularMap,t(p.specularMap,m.specularMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest);let y=e.get(p),w=y.envMap,M=y.envMapRotation;w&&(m.envMap.value=w,m.envMapRotation.value.setFromMatrix4(Yx.makeRotationFromEuler(M)).transpose(),w.isCubeTexture&&w.isRenderTargetTexture===!1&&m.envMapRotation.value.premultiply(kd),m.reflectivity.value=p.reflectivity,m.ior.value=p.ior,m.refractionRatio.value=p.refractionRatio),p.lightMap&&(m.lightMap.value=p.lightMap,m.lightMapIntensity.value=p.lightMapIntensity,t(p.lightMap,m.lightMapTransform)),p.aoMap&&(m.aoMap.value=p.aoMap,m.aoMapIntensity.value=p.aoMapIntensity,t(p.aoMap,m.aoMapTransform))}function a(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,p.map&&(m.map.value=p.map,t(p.map,m.mapTransform))}function o(m,p){m.dashSize.value=p.dashSize,m.totalSize.value=p.dashSize+p.gapSize,m.scale.value=p.scale}function l(m,p,y,w){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.size.value=p.size*y,m.scale.value=w*.5,p.map&&(m.map.value=p.map,t(p.map,m.uvTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function c(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.rotation.value=p.rotation,p.map&&(m.map.value=p.map,t(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function u(m,p){m.specular.value.copy(p.specular),m.shininess.value=Math.max(p.shininess,1e-4)}function h(m,p){p.gradientMap&&(m.gradientMap.value=p.gradientMap)}function d(m,p){m.metalness.value=p.metalness,p.metalnessMap&&(m.metalnessMap.value=p.metalnessMap,t(p.metalnessMap,m.metalnessMapTransform)),m.roughness.value=p.roughness,p.roughnessMap&&(m.roughnessMap.value=p.roughnessMap,t(p.roughnessMap,m.roughnessMapTransform)),p.envMap&&(m.envMapIntensity.value=p.envMapIntensity)}function f(m,p,y){m.ior.value=p.ior,p.diffuseRoughness>0&&(m.diffuseRoughness.value=p.diffuseRoughness,p.diffuseRoughnessMap&&(m.diffuseRoughnessMap.value=p.diffuseRoughnessMap,t(p.diffuseRoughnessMap,m.diffuseRoughnessMapTransform))),p.sheen>0&&(m.sheenColor.value.copy(p.sheenColor).multiplyScalar(p.sheen),m.sheenRoughness.value=p.sheenRoughness,p.sheenColorMap&&(m.sheenColorMap.value=p.sheenColorMap,t(p.sheenColorMap,m.sheenColorMapTransform)),p.sheenRoughnessMap&&(m.sheenRoughnessMap.value=p.sheenRoughnessMap,t(p.sheenRoughnessMap,m.sheenRoughnessMapTransform))),p.clearcoat>0&&(m.clearcoat.value=p.clearcoat,m.clearcoatRoughness.value=p.clearcoatRoughness,p.clearcoatMap&&(m.clearcoatMap.value=p.clearcoatMap,t(p.clearcoatMap,m.clearcoatMapTransform)),p.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=p.clearcoatRoughnessMap,t(p.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),p.clearcoatNormalMap&&(m.clearcoatNormalMap.value=p.clearcoatNormalMap,t(p.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(p.clearcoatNormalScale),p.side===Rt&&m.clearcoatNormalScale.value.negate())),p.dispersion>0&&(m.dispersion.value=p.dispersion),p.retroreflectivity>0&&(m.retroreflectivity.value=p.retroreflectivity),p.iridescence>0&&(m.iridescence.value=p.iridescence,m.iridescenceIOR.value=p.iridescenceIOR,m.iridescenceThicknessMinimum.value=p.iridescenceThicknessMinimum,m.iridescenceThicknessMaximum.value=p.iridescenceThicknessMaximum,p.iridescenceMap&&(m.iridescenceMap.value=p.iridescenceMap,t(p.iridescenceMap,m.iridescenceMapTransform)),p.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=p.iridescenceThicknessMap,t(p.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),p.transmission>0&&(m.transmission.value=p.transmission,m.transmissionSamplerMap.value=y.texture,m.transmissionSamplerSize.value.set(y.width,y.height),p.transmissionMap&&(m.transmissionMap.value=p.transmissionMap,t(p.transmissionMap,m.transmissionMapTransform)),m.thickness.value=p.thickness,p.thicknessMap&&(m.thicknessMap.value=p.thicknessMap,t(p.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=p.attenuationDistance,m.attenuationColor.value.copy(p.attenuationColor)),p.anisotropy>0&&(m.anisotropyVector.value.set(p.anisotropy*Math.cos(p.anisotropyRotation),p.anisotropy*Math.sin(p.anisotropyRotation)),p.anisotropyMap&&(m.anisotropyMap.value=p.anisotropyMap,t(p.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=p.specularIntensity,m.specularColor.value.copy(p.specularColor),p.specularColorMap&&(m.specularColorMap.value=p.specularColorMap,t(p.specularColorMap,m.specularColorMapTransform)),p.specularIntensityMap&&(m.specularIntensityMap.value=p.specularIntensityMap,t(p.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,p){p.matcap&&(m.matcap.value=p.matcap)}function _(m,p){let y=e.get(p).light;m.referencePosition.value.setFromMatrixPosition(y.matrixWorld),m.nearDistance.value=y.shadow.camera.near,m.farDistance.value=y.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function Qx(i,e,t,n){let s={},r={};function a(y,w){let M=w.program;n.uniformBlockBinding(y,M,s[y.id])}function o(y,w){let M=s[y.id];M===void 0&&(g(y),M=l(y),s[y.id]=M,y.addEventListener("dispose",m));let b=w.program;n.updateUBOMapping(y,b);let E=e.render.frame;r[y.id]!==E&&(c(y),r[y.id]=E)}function l(y){let w=i.createBuffer(),M=y.__size,b=y.usage;return i.bindBuffer(i.UNIFORM_BUFFER,w),i.bufferData(i.UNIFORM_BUFFER,M,b),i.bindBuffer(i.UNIFORM_BUFFER,null),w}function c(y){let w=s[y.id],M=y.uniforms,b=y.__cache;i.bindBuffer(i.UNIFORM_BUFFER,w);for(let E=0,x=M.length;E<x;E++){let T=M[E];if(Array.isArray(T))for(let N=0,C=T.length;N<C;N++)u(T[N],E,N,b);else u(T,E,0,b)}i.bindBuffer(i.UNIFORM_BUFFER,null)}function u(y,w,M,b){if(d(y,w,M,b)===!0){let E=y.__offset,x=y.value;if(Array.isArray(x)){let T=0;for(let N=0;N<x.length;N++){let C=x[N],P=_(C,!0);h(C,y.__data,T),T+=P.storage/Float32Array.BYTES_PER_ELEMENT}}else h(x,y.__data,0);i.bufferSubData(i.UNIFORM_BUFFER,E,y.__data)}}function h(y,w,M){typeof y=="number"||typeof y=="boolean"?w[M]=y:y.isMatrix3?(w[M]=y.elements[0],w[M+1]=y.elements[1],w[M+2]=y.elements[2],w[M+3]=0,w[M+4]=y.elements[3],w[M+5]=y.elements[4],w[M+6]=y.elements[5],w[M+7]=0,w[M+8]=y.elements[6],w[M+9]=y.elements[7],w[M+10]=y.elements[8],w[M+11]=0):ArrayBuffer.isView(y)?w.set(y.subarray(0,w.length-M),M):y.toArray(w,M)}function d(y,w,M,b){let E=y.value,x=w+"_"+M;if(Array.isArray(E)){b[x]===void 0&&(b[x]=[]);let T=b[x],N=!1;for(let C=0;C<E.length;C++)f(E[C],T,C)===!0&&(N=!0);return N}return f(E,b,x)}function f(y,w,M){if(w[M]===void 0)return typeof y=="number"||typeof y=="boolean"?w[M]=y:ArrayBuffer.isView(y)?w[M]=y.slice():w[M]=y.clone(),!0;{let b=w[M];if(typeof y=="number"||typeof y=="boolean"){if(b!==y)return w[M]=y,!0}else{if(ArrayBuffer.isView(y))return!0;if(b.equals(y)===!1)return b.copy(y),!0}}return!1}function g(y){let w=y.uniforms,M=0,b=16;for(let x=0,T=w.length;x<T;x++){let N=Array.isArray(w[x])?w[x]:[w[x]];for(let C=0,P=N.length;C<P;C++){let F=N[C],G=Array.isArray(F.value)?F.value:[F.value],A=Array.isArray(w[x])||Array.isArray(F.value),U=M;for(let V=0,$=G.length;V<$;V++){let q=G[V],Q=_(q,A),ee=M%b,ve=ee%Q.boundary,Ie=ee+ve;M+=ve,Ie!==0&&b-Ie<Q.storage&&(M+=b-Ie),V===0&&(U=M),M+=Q.storage}let B=F.type==="int"?Int32Array:F.type==="uint"?Uint32Array:Float32Array;F.__data=new B((M-U)/Float32Array.BYTES_PER_ELEMENT),F.__offset=U}}let E=M%b;return E>0&&(M+=b-E),y.__size=M,y.__cache={},this}function _(y,w){let M={boundary:0,storage:0};return typeof y=="number"||typeof y=="boolean"?(M.boundary=4,M.storage=4):y.isVector2?(M.boundary=8,M.storage=8):y.isVector3||y.isColor?(M.boundary=16,M.storage=12):y.isVector4?(M.boundary=16,M.storage=16):y.isMatrix3?(M.boundary=16,M.storage=48):y.isMatrix4?(M.boundary=16,M.storage=64):y.isTexture?be("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(y)?(M.boundary=16,M.storage=y.byteLength):be("WebGLRenderer: Unsupported uniform value type.",y),w===!0&&(M.boundary=16,M.storage=Math.ceil(M.storage/16)*16),M}function m(y){let w=y.target;w.removeEventListener("dispose",m),i.deleteBuffer(s[w.id]),delete s[w.id],delete r[w.id]}function p(){for(let y in s)i.deleteBuffer(s[y]);s={},r={}}return{bind:a,update:o,dispose:p}}var $x=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),Vn=null;function ey(){return Vn===null&&(Vn=new Si($x,16,16,wi,_t),Vn.name="DFG_LUT",Vn.minFilter=ut,Vn.magFilter=ut,Vn.wrapS=_n,Vn.wrapT=_n,Vn.generateMipmaps=!1,Vn.needsUpdate=!0),Vn}var nl=class{constructor(e={}){let{canvas:t=nd(),context:n=null,depth:s=!0,stencil:r=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:u="default",failIfMajorPerformanceCaveat:h=!1,reversedDepthBuffer:d=!1,outputBufferType:f=on}=e;this.isWebGLRenderer=!0;let g;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");g=n.getContextAttributes().alpha}else g=a;let _=f,m=new Set([So,_o,vo]),p=new Set([on,Cn,Gs,Yi,xo,yo]),y=new Uint32Array(4),w=new Int32Array(4),M={textures:[],min:[],max:[],resolution:[]},b=null,E=null,x=[],T=[],N=null;this.domElement=t,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=Fn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let C=this,P=!1,F=null,G=null,A=null,U=null;this._outputColorSpace=At;let B=0,V=0,$=null,q=-1,Q=null,ee=new Ye,ve=new Ye,Ie=null,j=new Te(0),ce=0,xe=t.width,Re=t.height,fe=1,De=null,St=null,Pe=new Ye(0,0,xe,Re),et=new Ye(0,0,xe,Re),nt=!1,qe=new Mi,Ot=new Ja,wt=!1,$t=!1,lt=new Le,Pn=new D,Pt=new Ye,mn={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},gn=!1;function xn(){return $===null?fe:1}let O=n;function yn(S,L){return t.getContext(S,L)}let at,ot,de,Et,Ce,Oe,R,v,z,te,J,se,ue,K,Z,ae,I,Y,X,oe,ie,re,we;try{let S={alpha:!0,depth:s,stencil:r,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:u,failIfMajorPerformanceCaveat:h};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${"187"}`),t.addEventListener("webglcontextlost",Ae,!1),t.addEventListener("webglcontextrestored",Be,!1),t.addEventListener("webglcontextcreationerror",pe,!1),O===null){let L="webgl2";if(O=yn(L,S),O===null)throw yn(L)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}ze()}catch(S){throw t.removeEventListener("webglcontextlost",Ae,!1),t.removeEventListener("webglcontextrestored",Be,!1),t.removeEventListener("webglcontextcreationerror",pe,!1),Ne("WebGLRenderer: "+S.message),S}function ze(){at=new h0(O),at.init(),ie=new Kx(O,at),ot=new e0(O,at,e,ie),de=new qx(O,at),ot.reversedDepthBuffer&&d&&de.buffers.depth.setReversed(!0),G=O.createFramebuffer(),A=O.createFramebuffer(),U=O.createFramebuffer(),Et=new p0(O),Ce=new Px,Oe=new Xx(O,at,de,Ce,ot,ie,Et),R=new u0(C),v=new gp(O),re=new Qg(O,v),z=new d0(O,v,Et,re),te=new g0(O,z,v,re,Et),Y=new m0(O,ot,Oe),Z=new t0(Ce),J=new Ix(C,R,at,ot,re,Z),se=new Jx(C,Ce),ue=new Lx,K=new Vx(at),I=new Jg(C,R,de,te,g,l),ae=new Wx(C,te,ot),we=new Qx(O,Et,ot,de),X=new $g(O,at,Et),oe=new f0(O,at,Et),Et.programs=J.programs,C.capabilities=ot,C.extensions=at,C.properties=Ce,C.renderLists=ue,C.shadowMap=ae,C.state=de,C.info=Et}_!==on&&(N=new y0(_,t.width,t.height,o,s,r));let ne=new Vc(C,O);this.xr=ne,this.getContext=function(){return O},this.getContextAttributes=function(){return O.getContextAttributes()},this.forceContextLoss=function(){let S=at.get("WEBGL_lose_context");S&&S.loseContext()},this.forceContextRestore=function(){let S=at.get("WEBGL_lose_context");S&&S.restoreContext()},this.getPixelRatio=function(){return fe},this.setPixelRatio=function(S){S!==void 0&&(fe=S,this.setSize(xe,Re,!1))},this.getSize=function(S){return S.set(xe,Re)},this.setSize=function(S,L,W=!0){if(ne.isPresenting){be("WebGLRenderer: Can't change size while VR device is presenting.");return}xe=S,Re=L,t.width=Math.floor(S*fe),t.height=Math.floor(L*fe),W===!0&&(t.style.width=S+"px",t.style.height=L+"px"),N!==null&&N.setSize(t.width,t.height),this.setViewport(0,0,S,L)},this.getDrawingBufferSize=function(S){return S.set(xe*fe,Re*fe).floor()},this.setDrawingBufferSize=function(S,L,W){xe=S,Re=L,fe=W,t.width=Math.floor(S*W),t.height=Math.floor(L*W),this.setViewport(0,0,S,L)},this.setEffects=function(S){if(_===on){Ne("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(S){for(let L=0;L<S.length;L++)if(S[L].isOutputPass===!0){be("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}N.setEffects(S||[])},this.getCurrentViewport=function(S){return S.copy(ee)},this.getViewport=function(S){return S.copy(Pe)},this.setViewport=function(S,L,W,k){S.isVector4?Pe.set(S.x,S.y,S.z,S.w):Pe.set(S,L,W,k),de.viewport(ee.copy(Pe).multiplyScalar(xn()).round())},this.getScissor=function(S){return S.copy(et)},this.setScissor=function(S,L,W,k){S.isVector4?et.set(S.x,S.y,S.z,S.w):et.set(S,L,W,k),de.scissor(ve.copy(et).multiplyScalar(xn()).round())},this.getScissorTest=function(){return nt},this.setScissorTest=function(S){de.setScissorTest(nt=S)},this.setOpaqueSort=function(S){De=S},this.setTransparentSort=function(S){St=S},this.getClearColor=function(S){return S.copy(I.getClearColor())},this.setClearColor=function(){I.setClearColor(...arguments)},this.getClearAlpha=function(){return I.getClearAlpha()},this.setClearAlpha=function(){I.setClearAlpha(...arguments)},this.clear=function(S=!0,L=!0,W=!0){let k=0;if(S){let H=!1;if($!==null){let he=$.texture.format;H=m.has(he)}if(H){let he=$.texture.type,ye=p.has(he),le=I.getClearColor(),ge=I.getClearAlpha(),Me=le.r,Fe=le.g,Xe=le.b;ye?(y[0]=Me,y[1]=Fe,y[2]=Xe,y[3]=ge,O.clearBufferuiv(O.COLOR,0,y)):(w[0]=Me,w[1]=Fe,w[2]=Xe,w[3]=ge,O.clearBufferiv(O.COLOR,0,w))}else k|=O.COLOR_BUFFER_BIT}L&&(k|=O.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),W&&(k|=O.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),k!==0&&O.clear(k)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(S){S.setRenderer(this),F=S},this.dispose=function(){t.removeEventListener("webglcontextlost",Ae,!1),t.removeEventListener("webglcontextrestored",Be,!1),t.removeEventListener("webglcontextcreationerror",pe,!1),I.dispose(),ue.dispose(),K.dispose(),Oe.dispose(),Ce.dispose(),R.dispose(),te.dispose(),z.dispose(),re.dispose(),we.dispose(),J.dispose(),ne.dispose(),ne.removeEventListener("sessionstart",Mu),ne.removeEventListener("sessionend",bu),Ri.stop()};function Ae(S){S.preventDefault(),mr("WebGLRenderer: Context Lost."),P=!0}function Be(){mr("WebGLRenderer: Context Restored."),P=!1;let S=Et.autoReset,L=ae.enabled,W=ae.autoUpdate,k=ae.needsUpdate,H=ae.type;ze(),Et.autoReset=S,ae.enabled=L,ae.autoUpdate=W,ae.needsUpdate=k,ae.type=H}function pe(S){Ne("WebGLRenderer: A WebGL context could not be created. Reason: ",S.statusMessage)}function tt(S){let L=S.target;L.removeEventListener("dispose",tt),Nt(L)}function Nt(S){hi(S),Ce.remove(S)}function hi(S){let L=Ce.get(S).programs;L!==void 0&&(L.forEach(function(W){J.releaseProgram(W)}),S.isShaderMaterial&&J.releaseShaderCache(S))}this.renderBufferDirect=function(S,L,W,k,H,he){L===null&&(L=mn);let ye=H.isMesh&&H.matrixWorld.determinantAffine()<0,le=af(S,L,W,k,H);de.setMaterial(k,ye);let ge=W.index,Me=1;if(k.wireframe===!0){if(ge=z.getWireframeAttribute(W),ge===void 0)return;Me=2}let Fe=W.drawRange,Xe=W.attributes.position,_e=Fe.start*Me,Ke=(Fe.start+Fe.count)*Me;he!==null&&(_e=Math.max(_e,he.start*Me),Ke=Math.min(Ke,(he.start+he.count)*Me)),ge!==null?(_e=Math.max(_e,0),Ke=Math.min(Ke,ge.count)):Xe!=null&&(_e=Math.max(_e,0),Ke=Math.min(Ke,Xe.count));let Mt=Ke-_e;if(Mt<0||Mt===1/0)return;re.setup(H,k,le,W,ge);let rt,it=X;if(ge!==null&&(rt=v.get(ge),it=oe,it.setIndex(rt)),H.isMesh)k.wireframe===!0?(de.setLineWidth(k.wireframeLinewidth*xn()),it.setMode(O.LINES)):it.setMode(O.TRIANGLES);else if(H.isLine){let Vt=k.linewidth;Vt===void 0&&(Vt=1),de.setLineWidth(Vt*xn()),H.isLineSegments?it.setMode(O.LINES):H.isLineLoop?it.setMode(O.LINE_LOOP):it.setMode(O.LINE_STRIP)}else H.isPoints?it.setMode(O.POINTS):H.isSprite&&it.setMode(O.TRIANGLES);if(H.isBatchedMesh)if(at.get("WEBGL_multi_draw"))it.renderMultiDraw(H._multiDrawStarts,H._multiDrawCounts,H._multiDrawCount);else{let Vt=H._multiDrawStarts,Se=H._multiDrawCounts,jt=H._multiDrawCount,Qe=ge?v.get(ge).bytesPerElement:1,Ci=Ce.get(k).currentProgram.getUniforms();for(let kt=0;kt<jt;kt++)Ci.setValue(O,"_gl_DrawID",kt),it.render(Vt[kt]/Qe,Se[kt])}else if(H.isInstancedMesh)it.renderInstances(_e,Mt,H.count);else if(W.isInstancedBufferGeometry){let Vt=W._maxInstanceCount!==void 0?W._maxInstanceCount:1/0,Se=Math.min(W.instanceCount,Vt);it.renderInstances(_e,Mt,Se)}else it.render(_e,Mt)};function Su(S,L,W,k){F!==null&&S.isNodeMaterial&&F.setObject(k,S),wt===!0&&Z.setState(S,W,!1),S.transparent===!0&&S.side===Xt&&S.forceSinglePass===!1?(S.side=Rt,S.needsUpdate=!0,tr(S,L,k),S.side=Mn,S.needsUpdate=!0,tr(S,L,k),S.side=Xt):tr(S,L,k)}this.compile=function(S,L,W=null){W===null&&(W=S),F!==null&&F.renderStart(S,L,W),E=K.get(W),E.init(L),T.push(E),W.traverseVisible(function(H){H.isLight&&H.layers.test(L.layers)&&(E.pushLight(H),H.castShadow&&E.pushShadow(H))}),S!==W&&S.traverseVisible(function(H){H.isLight&&H.layers.test(L.layers)&&(E.pushLight(H),H.castShadow&&E.pushShadow(H))}),E.setupLights(),F!==null&&F.updateLights(E.state.lightsArray),$t=this.localClippingEnabled,wt=Z.init(this.clippingPlanes,$t),wt===!0&&Z.setGlobalState(this.clippingPlanes,L),F!==null&&ae.render(E.state.shadowsArray,W,L);let k=new Set;return S.traverse(function(H){if(!(H.isMesh||H.isPoints||H.isLine||H.isSprite))return;let he=H.material;if(he)if(Array.isArray(he))for(let ye=0;ye<he.length;ye++){let le=he[ye];Su(le,W,L,H),k.add(le)}else Su(he,W,L,H),k.add(he)}),E=T.pop(),F!==null&&F.renderEnd(),k},this.compileAsync=function(S,L,W=null){let k=this.compile(S,L,W);return new Promise(H=>{function he(){if(k.forEach(function(ye){let ge=Ce.get(ye).currentProgram;(ge===void 0||ge.isReady())&&k.delete(ye)}),k.size===0){H(S);return}setTimeout(he,10)}at.get("KHR_parallel_shader_compile")!==null?he():setTimeout(he,10)})};let ml=null;function sf(S){ml&&ml(S)}function Mu(){Ri.stop()}function bu(){Ri.start()}let Ri=new Id;Ri.setAnimationLoop(sf),typeof self<"u"&&Ri.setContext(self),this.setAnimationLoop=function(S){ml=S,ne.setAnimationLoop(S),S===null?Ri.stop():Ri.start()},ne.addEventListener("sessionstart",Mu),ne.addEventListener("sessionend",bu),this.render=function(S,L){if(L!==void 0&&L.isCamera!==!0){Ne("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(P===!0)return;F!==null&&F.renderStart(S,L);let W=ne.enabled===!0&&ne.isPresenting===!0,k=N!==null&&($===null||W)&&N.begin(C,$);if(S.matrixWorldAutoUpdate===!0&&S.updateMatrixWorld(),L.parent===null&&L.matrixWorldAutoUpdate===!0&&L.updateMatrixWorld(),ne.enabled===!0&&ne.isPresenting===!0&&(N===null||N.isCompositing()===!1)&&(ne.cameraAutoUpdate===!0&&ne.updateCamera(L),L=ne.getCamera()),S.isScene===!0&&S.onBeforeRender(C,S,L,$),E=K.get(S,T.length),E.init(L),E.state.textureUnits=Oe.getTextureUnits(),T.push(E),lt.multiplyMatrices(L.projectionMatrix,L.matrixWorldInverse),L.isArrayCamera?Ot.setFromArrayCamera(L):qe.setFromProjectionMatrix(lt,Sn,L.reversedDepth),$t=this.localClippingEnabled,wt=Z.init(this.clippingPlanes,$t),b=ue.get(S,x.length),b.init(),x.push(b),this.info.render.frame++,ne.enabled===!0&&ne.isPresenting===!0){let ye=C.xr.getDepthSensingMesh();ye!==null&&gl(ye,L,-1/0,C.sortObjects)}gl(S,L,0,C.sortObjects),b.finish(),F!==null&&F.updateLights(E.state.lightsArray),C.sortObjects===!0&&b.sort(De,St),gn=ne.enabled===!1||ne.isPresenting===!1||ne.hasDepthSensing()===!1,gn&&I.addToRenderList(b,S),this.info.autoReset===!0&&this.info.reset(),wt===!0&&Z.beginShadows();let H=E.state.shadowsArray;if(ae.render(H,S,L),wt===!0&&Z.endShadows(),(k&&N.hasRenderPass())===!1){let ye=b.opaque,le=b.transmissive;if(E.setupLights(),L.isArrayCamera){let ge=L.cameras;if(le.length>0)for(let Me=0,Fe=ge.length;Me<Fe;Me++){let Xe=ge[Me];wu(ye,le,S,Xe)}gn&&I.render(S);for(let Me=0,Fe=ge.length;Me<Fe;Me++){let Xe=ge[Me];Tu(b,S,Xe,Xe.viewport)}}else le.length>0&&wu(ye,le,S,L),gn&&I.render(S),Tu(b,S,L)}$!==null&&V===0&&(Oe.updateMultisampleRenderTarget($),Oe.updateRenderTargetMipmap($)),k&&N.end(C),S.isScene===!0&&S.onAfterRender(C,S,L),re.resetDefaultState(),q=-1,Q=null,T.pop(),T.length>0?(E=T[T.length-1],Oe.setTextureUnits(E.state.textureUnits),wt===!0&&Z.setGlobalState(C.clippingPlanes,E.state.camera)):E=null,x.pop(),x.length>0?b=x[x.length-1]:b=null,F!==null&&F.renderEnd()};function gl(S,L,W,k){if(S.visible===!1)return;if(S.layers.test(L.layers)){if(S.isGroup)W=S.renderOrder;else if(S.isLOD)S.autoUpdate===!0&&S.update(L);else if(S.isLight)E.pushLight(S),S.castShadow&&E.pushShadow(S);else if(S.isSprite){let ye=L.isArrayCamera?Ot:qe;if(!S.frustumCulled||S.intersectsFrustum(ye)){k&&Pt.setFromMatrixPosition(S.matrixWorld).applyMatrix4(lt);let le=te.update(S),ge=S.material;ge.visible&&b.push(S,le,ge,W,Pt.z,null,L)}}else if(S.isMesh||S.isLine||S.isPoints){let ye=L.isArrayCamera?Ot:qe;if(!S.frustumCulled||S.intersectsFrustum(ye)){let le=te.update(S),ge=S.material;if(k&&(S.boundingSphere!==void 0?(S.boundingSphere===null&&S.computeBoundingSphere(),Pt.copy(S.boundingSphere.center)):(le.boundingSphere===null&&le.computeBoundingSphere(),Pt.copy(le.boundingSphere.center)),Pt.applyMatrix4(S.matrixWorld).applyMatrix4(lt)),Array.isArray(ge)){let Me=le.groups;for(let Fe=0,Xe=Me.length;Fe<Xe;Fe++){let _e=Me[Fe],Ke=ge[_e.materialIndex];Ke&&Ke.visible&&b.push(S,le,Ke,W,Pt.z,_e,L)}}else ge.visible&&b.push(S,le,ge,W,Pt.z,null,L)}}}let he=S.children;for(let ye=0,le=he.length;ye<le;ye++)gl(he[ye],L,W,k)}function Tu(S,L,W,k){let{opaque:H,transmissive:he,transparent:ye}=S;E.setupLightsView(W),wt===!0&&Z.setGlobalState(C.clippingPlanes,W),k&&de.viewport(ee.copy(k)),H.length>0&&la(H,L,W),he.length>0&&la(he,L,W),ye.length>0&&la(ye,L,W),de.buffers.depth.setTest(!0),de.buffers.depth.setMask(!0),de.buffers.color.setMask(!0),de.setPolygonOffset(!1)}function wu(S,L,W,k){if((W.isScene===!0?W.overrideMaterial:null)!==null)return;if(E.state.transmissionRenderTarget[k.id]===void 0){let _e=at.has("EXT_color_buffer_half_float")||at.has("EXT_color_buffer_float");E.state.transmissionRenderTarget[k.id]=new mt(1,1,{generateMipmaps:!0,type:_e?_t:on,minFilter:an,samples:Math.max(4,ot.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:Ve.workingColorSpace})}let he=E.state.transmissionRenderTarget[k.id],ye=k.viewport||ee;he.setSize(ye.z*C.transmissionResolutionScale,ye.w*C.transmissionResolutionScale);let le=C.getRenderTarget(),ge=C.getActiveCubeFace(),Me=C.getActiveMipmapLevel();C.setRenderTarget(he),C.getClearColor(j),ce=C.getClearAlpha(),ce<1&&C.setClearColor(16777215,.5),C.clear(),gn&&I.render(W);let Fe=C.toneMapping;C.toneMapping=Fn;let Xe=k.viewport;if(k.viewport!==void 0&&(k.viewport=void 0),E.setupLightsView(k),wt===!0&&Z.setGlobalState(C.clippingPlanes,k),la(S,W,k),Oe.updateMultisampleRenderTarget(he),Oe.updateRenderTargetMipmap(he),at.has("WEBGL_multisampled_render_to_texture")===!1){let _e=!1;for(let Ke=0,Mt=L.length;Ke<Mt;Ke++){let rt=L[Ke],{object:it,geometry:Vt,material:Se,group:jt}=rt;if(Se.side===Xt&&it.layers.test(k.layers)){let Qe=Se.side;Se.side=Rt,Se.needsUpdate=!0,Eu(it,W,k,Vt,Se,jt),Se.side=Qe,Se.needsUpdate=!0,_e=!0}}_e===!0&&(Oe.updateMultisampleRenderTarget(he),Oe.updateRenderTargetMipmap(he))}C.setRenderTarget(le,ge,Me),C.setClearColor(j,ce),Xe!==void 0&&(k.viewport=Xe),C.toneMapping=Fe}function la(S,L,W){let k=L.isScene===!0?L.overrideMaterial:null;for(let H=0,he=S.length;H<he;H++){let ye=S[H],{object:le,geometry:ge,group:Me}=ye,Fe=ye.material;Fe.allowOverride===!0&&k!==null&&(Fe=k),le.layers.test(W.layers)&&Eu(le,L,W,ge,Fe,Me)}}function Eu(S,L,W,k,H,he){F!==null&&H.isNodeMaterial&&F.setObject(S,H),S.onBeforeRender(C,L,W,k,H,he),S.modelViewMatrix.multiplyMatrices(W.matrixWorldInverse,S.matrixWorld),S.normalMatrix.getNormalMatrix(S.modelViewMatrix),H.onBeforeRender(C,L,W,k,S,he),H.transparent===!0&&H.side===Xt&&H.forceSinglePass===!1?(H.side=Rt,H.needsUpdate=!0,C.renderBufferDirect(W,L,k,H,S,he),H.side=Mn,H.needsUpdate=!0,C.renderBufferDirect(W,L,k,H,S,he),H.side=Xt):C.renderBufferDirect(W,L,k,H,S,he),S.onAfterRender(C,L,W,k,H,he)}function Au(S){let L=0;for(let W of S)W.texture!==null&&L++;return L}function tr(S,L,W){L.isScene!==!0&&(L=mn);let k=Ce.get(S),H=E.state.lights,he=E.state.shadowsArray,ye=H.state.version,le=J.getParameters(S,H.state,he,L,W,E.state.lightProbeGridArray),ge=J.getProgramCacheKey(le),Me=k.programs;k.environment=S.isMeshStandardMaterial||S.isMeshLambertMaterial||S.isMeshPhongMaterial?L.environment:null,k.fog=L.fog;let Fe=S.isMeshStandardMaterial||S.isMeshLambertMaterial&&!S.envMap||S.isMeshPhongMaterial&&!S.envMap;k.envMap=R.get(S.envMap||k.environment,Fe),k.envMapRotation=k.environment!==null&&S.envMap===null?L.environmentRotation:S.envMapRotation,Me===void 0&&(S.addEventListener("dispose",tt),Me=new Map,k.programs=Me,k.programVariants=new Map);let Xe=Me.get(ge);if(Xe!==void 0){if(k.currentProgram===Xe&&k.lightsStateVersion===ye)return Cu(S,le),Xe}else le.uniforms=J.getUniforms(S),F!==null&&S.isNodeMaterial&&F.build(S,W,le),S.onBeforeCompile(le,C),Xe=J.acquireProgram(le,ge),Me.set(ge,Xe),k.uniforms=le.uniforms;let _e=k.uniforms;return(!S.isShaderMaterial&&!S.isRawShaderMaterial||S.clipping===!0)&&(_e.clippingPlanes=Z.uniform),Cu(S,le),k.needsLights=lf(S),k.lightsStateVersion=ye,k.needsLights&&(_e.ambientLightColor.value=H.state.ambient,_e.lightProbe.value=H.state.probe,_e.sunLights.value=H.state.sun,_e.sunLightShadows.value=H.state.sunShadow,_e.directionalLights.value=H.state.directional,_e.directionalLightShadows.value=H.state.directionalShadow,_e.spotLights.value=H.state.spot,_e.spotLightShadows.value=H.state.spotShadow,_e.rectAreaLights.value=H.state.rectArea,_e.ltc_1.value=H.state.rectAreaLTC1,_e.ltc_2.value=H.state.rectAreaLTC2,_e.pointLights.value=H.state.point,_e.pointLightShadows.value=H.state.pointShadow,_e.hemisphereLights.value=H.state.hemi,_e.sunShadowMatrix.value=H.state.sunShadowMatrix,_e.sunShadowCascade.value=H.state.sunShadowCascade,_e.directionalShadowMatrix.value=H.state.directionalShadowMatrix,_e.spotLightMatrix.value=H.state.spotLightMatrix,_e.spotLightMap.value=H.state.spotLightMap,_e.pointShadowMatrix.value=H.state.pointShadowMatrix),k.numLightProbeGrids=Au(E.state.lightProbeGridArray),k.currentProgram=Xe,k.uniformsList=null,Xe}function rf(S,L,W,k,H){let he=Ce.get(S),ye=he.currentProgram.id+","+k+","+H,le=he.programVariants.get(ye);return le===void 0?(le=tr(S,L,W),he.programVariants.set(ye,le)):(he.currentProgram=le,he.uniformsList=null,he.outputColorSpace=k,he.toneMapping=H),le}function Ru(S){if(S.uniformsList===null){let L=S.currentProgram.getUniforms();S.uniformsList=qs.seqWithValue(L.seq,S.uniforms)}return S.uniformsList}function Cu(S,L){let W=Ce.get(S);W.outputColorSpace=L.outputColorSpace,W.batching=L.batching,W.batchingColor=L.batchingColor,W.instancing=L.instancing,W.instancingColor=L.instancingColor,W.instancingMorph=L.instancingMorph,W.skinning=L.skinning,W.morphTargets=L.morphTargets,W.morphNormals=L.morphNormals,W.morphColors=L.morphColors,W.morphTargetsCount=L.morphTargetsCount,W.numClippingPlanes=L.numClippingPlanes,W.numIntersection=L.numClipIntersection,W.vertexAlphas=L.vertexAlphas,W.vertexTangents=L.vertexTangents,W.toneMapping=L.toneMapping}function af(S,L,W,k,H){L.isScene!==!0&&(L=mn),Oe.resetTextureUnits();let he=L.fog,ye=k.isMeshStandardMaterial||k.isMeshLambertMaterial||k.isMeshPhongMaterial?L.environment:null,le=$===null?C.outputColorSpace:$.isXRRenderTarget===!0?$.texture.colorSpace:Ve.workingColorSpace,ge=k.isMeshStandardMaterial||k.isMeshLambertMaterial&&!k.envMap||k.isMeshPhongMaterial&&!k.envMap,Me=R.get(k.envMap||ye,ge),Fe=k.vertexColors===!0&&!!W.attributes.color&&W.attributes.color.itemSize===4,Xe=!!W.attributes.tangent&&(!!k.normalMap||k.anisotropy>0),_e=!!W.morphAttributes.position,Ke=!!W.morphAttributes.normal,Mt=!!W.morphAttributes.color,rt=Fn;k.toneMapped&&($===null||$.isXRRenderTarget===!0)&&(rt=C.toneMapping);let it=W.morphAttributes.position||W.morphAttributes.normal||W.morphAttributes.color,Vt=it!==void 0?it.length:0,Se=Ce.get(k),jt=E.state.lights;if(wt===!0&&($t===!0||S!==Q)){let ct=S===Q&&k.id===q;Z.setState(k,S,ct)}let Qe=!1,Ci=!1;k.version===Se.__version?Se.needsLights&&Se.lightsStateVersion!==jt.state.version||H.isBatchedMesh&&Se.batching===!1||!H.isBatchedMesh&&Se.batching===!0||H.isBatchedMesh&&Se.batchingColor===!0&&H._colorsTexture===null||H.isBatchedMesh&&Se.batchingColor===!1&&H._colorsTexture!==null||H.isInstancedMesh&&Se.instancing===!1||!H.isInstancedMesh&&Se.instancing===!0||H.isSkinnedMesh&&Se.skinning===!1||!H.isSkinnedMesh&&Se.skinning===!0||H.isInstancedMesh&&Se.instancingColor===!0&&H.instanceColor===null||H.isInstancedMesh&&Se.instancingColor===!1&&H.instanceColor!==null||H.isInstancedMesh&&Se.instancingMorph===!0&&H.morphTexture===null||H.isInstancedMesh&&Se.instancingMorph===!1&&H.morphTexture!==null||Se.envMap!==Me||k.fog===!0&&Se.fog!==he||Se.numClippingPlanes!==void 0&&(Se.numClippingPlanes!==Z.numPlanes||Se.numIntersection!==Z.numIntersection)||Se.vertexAlphas!==Fe||Se.vertexTangents!==Xe||Se.morphTargets!==_e||Se.morphNormals!==Ke||Se.morphColors!==Mt||Se.morphTargetsCount!==Vt||Se.numLightProbeGrids!==Au(E.state.lightProbeGridArray)?Qe=!0:(Se.outputColorSpace!==le||Se.toneMapping!==rt)&&(Ci=!0):(Qe=!0,Se.__version=k.version);let kt=Se.currentProgram;(Qe===!0||Ci===!0)&&(kt=Ci===!0?rf(k,L,H,le,rt):tr(k,L,H),F&&k.isNodeMaterial&&F.onUpdateProgram(k,kt,Se));let ca=!1,di=!1,Ii=!1,Ze=kt.getUniforms(),Ft=Se.uniforms;if(de.useProgram(kt.program)&&(ca=!0,di=!0,Ii=!0),k.id!==q&&(q=k.id,di=!0),ca||Q!==S){de.buffers.depth.getReversed()&&S.reversedDepth!==!0&&(S._reversedDepth=!0,S.updateProjectionMatrix()),Ze.setValue(O,"projectionMatrix",S.projectionMatrix),Ze.setValue(O,"viewMatrix",S.matrixWorldInverse);let Lt=Ze.map.cameraPosition;Lt!==void 0&&Lt.setValue(O,Pn.setFromMatrixPosition(S.matrixWorld)),ot.logarithmicDepthBuffer&&Ze.setValue(O,"logDepthBufFC",2/(Math.log(S.far+1)/Math.LN2)),(k.isMeshPhongMaterial||k.isMeshToonMaterial||k.isMeshLambertMaterial||k.isMeshBasicMaterial||k.isMeshStandardMaterial||k.isShaderMaterial)&&Ze.setValue(O,"isOrthographic",S.isOrthographicCamera===!0),Q!==S&&(Q=S,di=!0,Ii=!0)}if(Se.needsLights&&(jt.state.sunShadowMap.length>0&&Ze.setValue(O,"sunShadowMap",jt.state.sunShadowMap,Oe),jt.state.directionalShadowMap.length>0&&Ze.setValue(O,"directionalShadowMap",jt.state.directionalShadowMap,Oe),jt.state.spotShadowMap.length>0&&Ze.setValue(O,"spotShadowMap",jt.state.spotShadowMap,Oe),jt.state.pointShadowMap.length>0&&Ze.setValue(O,"pointShadowMap",jt.state.pointShadowMap,Oe)),H.isSkinnedMesh){Ze.setOptional(O,H,"bindMatrix"),Ze.setOptional(O,H,"bindMatrixInverse");let ct=H.skeleton;ct&&(ct.boneTexture===null&&ct.computeBoneTexture(),Ze.setValue(O,"boneTexture",ct.boneTexture,Oe))}H.isBatchedMesh&&(Ze.setOptional(O,H,"batchingTexture"),Ze.setValue(O,"batchingTexture",H._matricesTexture,Oe),Ze.setOptional(O,H,"batchingIdTexture"),Ze.setValue(O,"batchingIdTexture",H._indirectTexture,Oe),Ze.setOptional(O,H,"batchingColorTexture"),H._colorsTexture!==null&&Ze.setValue(O,"batchingColorTexture",H._colorsTexture,Oe));let Tn=W.morphAttributes;if((Tn.position!==void 0||Tn.normal!==void 0||Tn.color!==void 0)&&Y.update(H,W,kt),(di||Se.receiveShadow!==H.receiveShadow)&&(Se.receiveShadow=H.receiveShadow,Ze.setValue(O,"receiveShadow",H.receiveShadow)),(k.isMeshStandardMaterial||k.isMeshLambertMaterial||k.isMeshPhongMaterial)&&k.envMap===null&&L.environment!==null&&(Ft.envMapIntensity.value=L.environmentIntensity),Ft.dfgLUT!==void 0&&(Ft.dfgLUT.value=ey()),di){if(Ze.setValue(O,"toneMappingExposure",C.toneMappingExposure),Se.needsLights&&of(Ft,Ii),he&&k.fog===!0&&se.refreshFogUniforms(Ft,he),se.refreshMaterialUniforms(Ft,k,fe,Re,E.state.transmissionRenderTarget[S.id]),Se.needsLights&&Se.numLightProbeGrids>0){let ct=M,Lt=0;for(let Gn of E.state.lightProbeGridArray)Gn.texture!==null&&(ct.textures[Lt]=Gn.texture,ct.min[Lt]=Gn.boundingBox.min,ct.max[Lt]=Gn.boundingBox.max,ct.resolution[Lt]=Gn.resolution,Lt++);for(let Gn in ct)ct[Gn].length=Lt;Ft.probesSH.value=ct.textures,Ft.probesMin.value=ct.min,Ft.probesMax.value=ct.max,Ft.probesResolution.value=ct.resolution}qs.upload(O,Ru(Se),Ft,Oe)}if(k.isShaderMaterial&&k.uniformsNeedUpdate===!0&&(qs.upload(O,Ru(Se),Ft,Oe),k.uniformsNeedUpdate=!1),k.isSpriteMaterial&&Ze.setValue(O,"center",H.center),Ze.setValue(O,"modelViewMatrix",H.modelViewMatrix),Ze.setValue(O,"normalMatrix",H.normalMatrix),Ze.setValue(O,"modelMatrix",H.matrixWorld),k.uniformsGroups!==void 0){let ct=k.uniformsGroups;for(let Lt=0,Gn=ct.length;Lt<Gn;Lt++){let Pu=ct[Lt];we.update(Pu,kt),we.bind(Pu,kt)}}return kt}function of(S,L){S.ambientLightColor.needsUpdate=L,S.lightProbe.needsUpdate=L,S.sunLights.needsUpdate=L,S.sunLightShadows.needsUpdate=L,S.directionalLights.needsUpdate=L,S.directionalLightShadows.needsUpdate=L,S.pointLights.needsUpdate=L,S.pointLightShadows.needsUpdate=L,S.spotLights.needsUpdate=L,S.spotLightShadows.needsUpdate=L,S.rectAreaLights.needsUpdate=L,S.hemisphereLights.needsUpdate=L}function lf(S){return S.isMeshLambertMaterial||S.isMeshToonMaterial||S.isMeshPhongMaterial||S.isMeshStandardMaterial||S.isShadowMaterial||S.isShaderMaterial&&S.lights===!0}this.getActiveCubeFace=function(){return B},this.getActiveMipmapLevel=function(){return V},this.getRenderTarget=function(){return $},this.setRenderTargetTextures=function(S,L,W){let k=Ce.get(S);k.__autoAllocateDepthBuffer=S.resolveDepthBuffer===!1,k.__autoAllocateDepthBuffer===!1&&(k.__useRenderToTexture=!1),Ce.get(S.texture).__webglTexture=L,Ce.get(S.depthTexture).__webglTexture=k.__autoAllocateDepthBuffer?void 0:W,k.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(S,L){let W=Ce.get(S);W.__webglFramebuffer=L,W.__useDefaultFramebuffer=L===void 0},this.setRenderTarget=function(S,L=0,W=0){$=S,B=L,V=W;let k=null,H=!1,he=!1;if(S){let le=Ce.get(S);if(le.__useDefaultFramebuffer!==void 0){de.bindFramebuffer(O.FRAMEBUFFER,le.__webglFramebuffer),ee.copy(S.viewport),ve.copy(S.scissor),Ie=S.scissorTest,de.viewport(ee),de.scissor(ve),de.setScissorTest(Ie),q=-1;return}else if(le.__webglFramebuffer===void 0)Oe.setupRenderTarget(S);else if(le.__hasExternalTextures)Oe.rebindTextures(S,Ce.get(S.texture).__webglTexture,Ce.get(S.depthTexture).__webglTexture);else if(S.depthBuffer){let Fe=S.depthTexture;if(le.__boundDepthTexture!==Fe){if(Fe!==null&&Ce.has(Fe)&&(S.width!==Fe.image.width||S.height!==Fe.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");Oe.setupDepthRenderbuffer(S)}}let ge=S.texture;(ge.isData3DTexture||ge.isDataArrayTexture||ge.isCompressedArrayTexture)&&(he=!0);let Me=Ce.get(S).__webglFramebuffer;S.isWebGLCubeRenderTarget?(Array.isArray(Me[L])?k=Me[L][W]:k=Me[L],H=!0):S.samples>0&&Oe.useMultisampledRTT(S)===!1?k=Ce.get(S).__webglMultisampledFramebuffer:Array.isArray(Me)?k=Me[W]:k=Me,ee.copy(S.viewport),ve.copy(S.scissor),Ie=S.scissorTest}else ee.copy(Pe).multiplyScalar(fe).floor(),ve.copy(et).multiplyScalar(fe).floor(),Ie=nt;if(W!==0&&(k=G),de.bindFramebuffer(O.FRAMEBUFFER,k)&&de.drawBuffers(S,k),de.viewport(ee),de.scissor(ve),de.setScissorTest(Ie),H){let le=Ce.get(S.texture);O.framebufferTexture2D(O.FRAMEBUFFER,O.COLOR_ATTACHMENT0,O.TEXTURE_CUBE_MAP_POSITIVE_X+L,le.__webglTexture,W)}else if(he){let le=L;for(let ge=0;ge<S.textures.length;ge++){let Me=Ce.get(S.textures[ge]);O.framebufferTextureLayer(O.FRAMEBUFFER,O.COLOR_ATTACHMENT0+ge,Me.__webglTexture,W,le)}}else if(S!==null&&W!==0){let le=Ce.get(S.texture);O.framebufferTexture2D(O.FRAMEBUFFER,O.COLOR_ATTACHMENT0,O.TEXTURE_2D,le.__webglTexture,W)}q=-1};function Iu(S){let L=Ce.get(S);return(L.__readFormat!==S.format||L.__readType!==S.type)&&(L.__readFormat=S.format,L.__readType=S.type,L.__formatReadable=ot.textureFormatReadable(S.format),L.__typeReadable=ot.textureTypeReadable(S.type)),L}this.readRenderTargetPixels=function(S,L,W,k,H,he,ye,le=0){if(!(S&&S.isWebGLRenderTarget)){Ne("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let ge=Ce.get(S).__webglFramebuffer;if(S.isWebGLCubeRenderTarget&&ye!==void 0&&(ge=ge[ye],Array.isArray(ge)&&(ge=ge[0])),ge){de.bindFramebuffer(O.FRAMEBUFFER,ge);try{let Me=S.textures[le],Fe=Me.format,Xe=Me.type;S.textures.length>1&&O.readBuffer(O.COLOR_ATTACHMENT0+le);let _e=Iu(Me);if(_e.__formatReadable===!1){Ne("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(_e.__typeReadable===!1){Ne("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}L>=0&&L<=S.width-k&&W>=0&&W<=S.height-H&&O.readPixels(L,W,k,H,ie.convert(Fe),ie.convert(Xe),he)}finally{let Me=$!==null?Ce.get($).__webglFramebuffer:null;de.bindFramebuffer(O.FRAMEBUFFER,Me)}}},this.readRenderTargetPixelsAsync=async function(S,L,W,k,H,he,ye,le=0){if(!(S&&S.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let ge=Ce.get(S).__webglFramebuffer;if(S.isWebGLCubeRenderTarget&&ye!==void 0&&(ge=ge[ye],Array.isArray(ge)&&(ge=ge[0])),ge)if(L>=0&&L<=S.width-k&&W>=0&&W<=S.height-H){de.bindFramebuffer(O.FRAMEBUFFER,ge);let Me=S.textures[le],Fe=Me.format,Xe=Me.type;S.textures.length>1&&O.readBuffer(O.COLOR_ATTACHMENT0+le);let _e=Iu(Me);if(_e.__formatReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(_e.__typeReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let Ke=O.createBuffer();O.bindBuffer(O.PIXEL_PACK_BUFFER,Ke),O.bufferData(O.PIXEL_PACK_BUFFER,he.byteLength,O.STREAM_READ),O.readPixels(L,W,k,H,ie.convert(Fe),ie.convert(Xe),0),O.bindBuffer(O.PIXEL_PACK_BUFFER,null);let Mt=$!==null?Ce.get($).__webglFramebuffer:null;de.bindFramebuffer(O.FRAMEBUFFER,Mt);let rt=O.fenceSync(O.SYNC_GPU_COMMANDS_COMPLETE,0);return O.flush(),await sd(O,rt,4),O.bindBuffer(O.PIXEL_PACK_BUFFER,Ke),O.getBufferSubData(O.PIXEL_PACK_BUFFER,0,he),O.bindBuffer(O.PIXEL_PACK_BUFFER,null),O.deleteBuffer(Ke),O.deleteSync(rt),he}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(S,L=null,W=0){let k=Math.pow(2,-W),H=Math.floor(S.image.width*k),he=Math.floor(S.image.height*k),ye=L!==null?L.x:0,le=L!==null?L.y:0;Oe.setTexture2D(S,0),O.copyTexSubImage2D(O.TEXTURE_2D,W,0,0,ye,le,H,he),de.unbindTexture()},this.copyTextureToTexture=function(S,L,W=null,k=null,H=0,he=0){let ye,le,ge,Me,Fe,Xe,_e,Ke,Mt,rt=S.isCompressedTexture?S.mipmaps[he]:S.image;if(W!==null)ye=W.max.x-W.min.x,le=W.max.y-W.min.y,ge=W.isBox3?W.max.z-W.min.z:1,Me=W.min.x,Fe=W.min.y,Xe=W.isBox3?W.min.z:0;else{let Ze=Math.pow(2,-H);ye=Math.floor(rt.width*Ze),le=Math.floor(rt.height*Ze),S.isDataArrayTexture?ge=rt.depth:S.isData3DTexture?ge=Math.floor(rt.depth*Ze):ge=1,Me=0,Fe=0,Xe=0}k!==null?(_e=k.x,Ke=k.y,Mt=k.z):(_e=0,Ke=0,Mt=0);let it=ie.convert(L.format),Vt=ie.convert(L.type),Se;L.isData3DTexture?(Oe.setTexture3D(L,0),Se=O.TEXTURE_3D):L.isDataArrayTexture||L.isCompressedArrayTexture?(Oe.setTexture2DArray(L,0),Se=O.TEXTURE_2D_ARRAY):(Oe.setTexture2D(L,0),Se=O.TEXTURE_2D),de.activeTexture(O.TEXTURE0),de.pixelStorei(O.UNPACK_FLIP_Y_WEBGL,L.flipY),de.pixelStorei(O.UNPACK_PREMULTIPLY_ALPHA_WEBGL,L.premultiplyAlpha),de.pixelStorei(O.UNPACK_ALIGNMENT,L.unpackAlignment);let jt=de.getParameter(O.UNPACK_ROW_LENGTH),Qe=de.getParameter(O.UNPACK_IMAGE_HEIGHT),Ci=de.getParameter(O.UNPACK_SKIP_PIXELS),kt=de.getParameter(O.UNPACK_SKIP_ROWS),ca=de.getParameter(O.UNPACK_SKIP_IMAGES);de.pixelStorei(O.UNPACK_ROW_LENGTH,rt.width),de.pixelStorei(O.UNPACK_IMAGE_HEIGHT,rt.height),de.pixelStorei(O.UNPACK_SKIP_PIXELS,Me),de.pixelStorei(O.UNPACK_SKIP_ROWS,Fe),de.pixelStorei(O.UNPACK_SKIP_IMAGES,Xe);let di=S.isDataArrayTexture||S.isData3DTexture,Ii=L.isDataArrayTexture||L.isData3DTexture;if(S.isDepthTexture){let Ze=Ce.get(S),Ft=Ce.get(L),Tn=Ce.get(Ze.__renderTarget),ct=Ce.get(Ft.__renderTarget);de.bindFramebuffer(O.READ_FRAMEBUFFER,Tn.__webglFramebuffer),de.bindFramebuffer(O.DRAW_FRAMEBUFFER,ct.__webglFramebuffer);for(let Lt=0;Lt<ge;Lt++)di&&(O.framebufferTextureLayer(O.READ_FRAMEBUFFER,O.COLOR_ATTACHMENT0,Ce.get(S).__webglTexture,H,Xe+Lt),O.framebufferTextureLayer(O.DRAW_FRAMEBUFFER,O.COLOR_ATTACHMENT0,Ce.get(L).__webglTexture,he,Mt+Lt)),O.blitFramebuffer(Me,Fe,Me+ye,Fe+le,_e,Ke,_e+ye,Ke+le,O.DEPTH_BUFFER_BIT,O.NEAREST);de.bindFramebuffer(O.READ_FRAMEBUFFER,null),de.bindFramebuffer(O.DRAW_FRAMEBUFFER,null)}else if(H!==0||S.isRenderTargetTexture||Ce.has(S)){let Ze=Ce.get(S),Ft=Ce.get(L);de.bindFramebuffer(O.READ_FRAMEBUFFER,A),de.bindFramebuffer(O.DRAW_FRAMEBUFFER,U);for(let Tn=0;Tn<ge;Tn++)di?O.framebufferTextureLayer(O.READ_FRAMEBUFFER,O.COLOR_ATTACHMENT0,Ze.__webglTexture,H,Xe+Tn):O.framebufferTexture2D(O.READ_FRAMEBUFFER,O.COLOR_ATTACHMENT0,O.TEXTURE_2D,Ze.__webglTexture,H),Ii?O.framebufferTextureLayer(O.DRAW_FRAMEBUFFER,O.COLOR_ATTACHMENT0,Ft.__webglTexture,he,Mt+Tn):O.framebufferTexture2D(O.DRAW_FRAMEBUFFER,O.COLOR_ATTACHMENT0,O.TEXTURE_2D,Ft.__webglTexture,he),H!==0?O.blitFramebuffer(Me,Fe,Me+ye,Fe+le,_e,Ke,_e+ye,Ke+le,O.COLOR_BUFFER_BIT,O.NEAREST):Ii?O.copyTexSubImage3D(Se,he,_e,Ke,Mt+Tn,Me,Fe,ye,le):O.copyTexSubImage2D(Se,he,_e,Ke,Me,Fe,ye,le);de.bindFramebuffer(O.READ_FRAMEBUFFER,null),de.bindFramebuffer(O.DRAW_FRAMEBUFFER,null)}else Ii?S.isDataTexture||S.isData3DTexture?O.texSubImage3D(Se,he,_e,Ke,Mt,ye,le,ge,it,Vt,rt.data):L.isCompressedArrayTexture?O.compressedTexSubImage3D(Se,he,_e,Ke,Mt,ye,le,ge,it,rt.data):O.texSubImage3D(Se,he,_e,Ke,Mt,ye,le,ge,it,Vt,rt):S.isDataTexture?O.texSubImage2D(O.TEXTURE_2D,he,_e,Ke,ye,le,it,Vt,rt.data):S.isCompressedTexture?O.compressedTexSubImage2D(O.TEXTURE_2D,he,_e,Ke,rt.width,rt.height,it,rt.data):O.texSubImage2D(O.TEXTURE_2D,he,_e,Ke,ye,le,it,Vt,rt);de.pixelStorei(O.UNPACK_ROW_LENGTH,jt),de.pixelStorei(O.UNPACK_IMAGE_HEIGHT,Qe),de.pixelStorei(O.UNPACK_SKIP_PIXELS,Ci),de.pixelStorei(O.UNPACK_SKIP_ROWS,kt),de.pixelStorei(O.UNPACK_SKIP_IMAGES,ca),he===0&&L.generateMipmaps===!0&&L.mipmapsAutoUpdate===!0&&O.generateMipmap(Se),de.unbindTexture()},this.initRenderTarget=function(S){Ce.get(S).__webglFramebuffer===void 0&&Oe.setupRenderTarget(S)},this.initTexture=function(S){S.isCubeTexture?Oe.setTextureCube(S,0):S.isData3DTexture?Oe.setTexture3D(S,0):S.isDataArrayTexture||S.isCompressedArrayTexture?Oe.setTexture2DArray(S,0):Oe.setTexture2D(S,0),de.unbindTexture()},this.resetState=function(){B=0,V=0,$=null,de.reset(),re.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Sn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=Ve._getDrawingBufferColorSpace(e),t.unpackColorSpace=Ve._getUnpackColorSpace()}};var na=class i extends je{constructor(){let e=i.SkyShader,t=new dt({name:e.name,uniforms:In.clone(e.uniforms),vertexShader:e.vertexShader,fragmentShader:e.fragmentShader,side:Rt,depthWrite:!1});super(new dn(1,1,1),t),this.isSky=!0}};na.SkyShader={name:"SkyShader",uniforms:{turbidity:{value:2},rayleigh:{value:1},mieCoefficient:{value:.005},mieDirectionalG:{value:.8},sunPosition:{value:new D},cloudScale:{value:2e-4},cloudSpeed:{value:2e-5},cloudCoverage:{value:.4},cloudDensity:{value:.4},cloudElevation:{value:.5},showSunDisc:{value:1},time:{value:0}},vertexShader:`
		uniform vec3 sunPosition;
		uniform float rayleigh;
		uniform float turbidity;
		uniform float mieCoefficient;

		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying float vSunfade;
		varying vec3 vBetaR;
		varying vec3 vBetaM;
		varying float vSunE;

		// constants for atmospheric scattering
		const float e = 2.71828182845904523536028747135266249775724709369995957;
		const float pi = 3.141592653589793238462643383279502884197169;

		// wavelength of used primaries, according to preetham
		const vec3 lambda = vec3( 680E-9, 550E-9, 450E-9 );
		// this pre-calculation replaces older TotalRayleigh(vec3 lambda) function:
		// (8.0 * pow(pi, 3.0) * pow(pow(n, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * pn)) / (3.0 * N * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * pn))
		const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );

		// mie stuff
		// K coefficient for the primaries
		const float v = 4.0;
		const vec3 K = vec3( 0.686, 0.678, 0.666 );
		// MieConst = pi * pow( ( 2.0 * pi ) / lambda, vec3( v - 2.0 ) ) * K
		const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );

		// earth shadow hack
		// cutoffAngle = pi / 1.95;
		const float cutoffAngle = 1.6110731556870734;
		const float steepness = 1.5;
		const float EE = 1000.0;

		float sunIntensity( float zenithAngleCos ) {
			zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
			return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
		}

		vec3 totalMie( float T ) {
			float c = ( 0.2 * T ) * 10E-18;
			return 0.434 * c * MieConst;
		}

		void main() {

			vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
			vWorldPosition = worldPosition.xyz;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			gl_Position.z = gl_Position.w; // set z to camera.far

			vSunDirection = normalize( sunPosition );

			vSunE = sunIntensity( vSunDirection.y );

			vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );

			float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );

			// extinction (absorption + out scattering)
			// rayleigh coefficients
			vBetaR = totalRayleigh * rayleighCoefficient;

			// mie coefficients
			vBetaM = totalMie( turbidity ) * mieCoefficient;

		}`,fragmentShader:`
		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying vec3 vBetaR;
		varying vec3 vBetaM;
		varying float vSunE;

		uniform float mieDirectionalG;
		uniform float cloudScale;
		uniform float cloudSpeed;
		uniform float cloudCoverage;
		uniform float cloudDensity;
		uniform float cloudElevation;
		uniform float showSunDisc;
		uniform float time;

		// gradient at a lattice corner; sinless hash so every GPU produces the same clouds
		vec2 gradient( vec2 i ) {
			vec3 p = fract( i.xyx * vec3( 0.1031, 0.1030, 0.0973 ) );
			p += dot( p, p.yzx + 33.33 );
			return fract( ( p.xx + p.yz ) * p.zy ) * 2.0 - 1.0;
		}

		// 2D gradient noise: isotropic lobes like Perlin at value-noise cost
		float noise( vec2 p ) {
			vec2 i = floor( p );
			vec2 f = fract( p );
			vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 ); // quintic fade
			float a = dot( gradient( i ), f );
			float b = dot( gradient( i + vec2( 1.0, 0.0 ) ), f - vec2( 1.0, 0.0 ) );
			float c = dot( gradient( i + vec2( 0.0, 1.0 ) ), f - vec2( 0.0, 1.0 ) );
			float d = dot( gradient( i + vec2( 1.0, 1.0 ) ), f - vec2( 1.0, 1.0 ) );
			return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y ) * 1.6; // ~[-1,1]
		}

		// fbm; per-octave drift makes clouds billow instead of scrolling as a rigid stamp
		float fbm( vec2 p, float drift ) {
			float result = 0.0;
			float amplitude = 1.0;
			for ( int i = 0; i < 4; i ++ ) {
				result += amplitude * noise( p );
				amplitude *= 0.5;
				p = p * 2.0 + drift;
			}
			return result;
		}

		// constants for atmospheric scattering
		const float pi = 3.141592653589793238462643383279502884197169;

		const float n = 1.0003; // refractive index of air
		const float N = 2.545E25; // number of molecules per unit volume for air at 288.15K and 1013mb (sea level -45 celsius)

		// optical length at zenith for molecules
		const float rayleighZenithLength = 8.4E3;
		const float mieZenithLength = 1.25E3;
		// 66 arc seconds -> degrees, and the cosine of that
		const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;

		// 3.0 / ( 16.0 * pi )
		const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
		// 1.0 / ( 4.0 * pi )
		const float ONE_OVER_FOURPI = 0.07957747154594767;

		float rayleighPhase( float cosTheta ) {
			return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
		}

		float hgPhase( float cosTheta, float g ) {
			float g2 = pow( g, 2.0 );
			float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
			return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
		}

		void main() {

			vec3 direction = normalize( vWorldPosition - cameraPosition );

			// optical length
			// cutoff angle at 90 to avoid singularity in next formula.
			float zenithAngle = acos( max( 0.0, direction.y ) );
			float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
			float sR = rayleighZenithLength * inverse;
			float sM = mieZenithLength * inverse;

			// combined extinction factor
			vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );

			// in scattering
			float cosTheta = dot( direction, vSunDirection );

			float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
			vec3 betaRTheta = vBetaR * rPhase;

			float mPhase = hgPhase( cosTheta, mieDirectionalG );
			vec3 betaMTheta = vBetaM * mPhase;

			vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
			Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - vSunDirection.y, 5.0 ), 0.0, 1.0 ) );

			// nightsky
			float theta = acos( direction.y ); // elevation --> y-axis, [-pi/2, pi/2]
			float phi = atan( direction.z, direction.x ); // azimuth --> x-axis [-pi/2, pi/2]
			vec2 uv = vec2( phi, theta ) / vec2( 2.0 * pi, pi ) + vec2( 0.5, 0.0 );
			vec3 L0 = vec3( 0.1 ) * Fex;

			// composition + solar disc
			float sundisc = clamp( ( cosTheta - sunAngularDiameterCos ) * 50000.0, 0.0, 1.0 ) * showSunDisc;
			vec3 sundiscColor = ( 760.0 * sundisc ) * min( vSunE * Fex, 80.0 );

			vec3 texColor = ( Lin + L0 ) * 0.04 + sundiscColor + vec3( 0.0, 0.0003, 0.00075 );

			// Clouds
			if ( direction.y > 0.0 && cloudCoverage > 0.0 ) {

				// Project to cloud plane (higher elevation = clouds appear lower/closer)
				float elevation = mix( 1.0, 0.1, cloudElevation );
				vec2 cloudUV = direction.xz / ( direction.y * elevation );
				cloudUV *= cloudScale;
				cloudUV += time * cloudSpeed;

				// Cloud density field
				float evolve = time * cloudSpeed * 300.0;
				float cloudNoise = clamp( fbm( cloudUV * 1000.0, evolve ) * 0.7 + 0.5, 0.0, 1.0 );

				// Large-scale coverage variation: clear gaps next to dense banks
				float region = noise( cloudUV * 300.0 ) * 0.37 + 0.5;
				float cov = clamp( cloudCoverage + ( region - 0.5 ) * 0.6, 0.0, 1.0 );

				// Carve clouds where noise rises above the coverage level
				float threshold = 1.0 - cov;
				float cloudMask = smoothstep( threshold, threshold + 0.3, cloudNoise );

				// Fade clouds near horizon (adjusted by elevation)
				float horizonFade = smoothstep( 0.0, 0.03 + 0.06 * cloudElevation, direction.y );
				cloudMask *= horizonFade;

				// Cloud lighting from the sky's own radiance
				float dayFactor = smoothstep( -0.08, 0.3, vSunDirection.y );
				vec3 sunColor = vSunE * Fex * 0.22 * 0.04; // 0.22 ~ albedo/pi, 0.04 = exposure; the aerial composite adds the eye-leg extinction
				vec3 skyAmbient = Lin * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

				// Beer-powder self-shadow from the sampled density
				float depth = max( 0.0, cloudNoise - threshold );
				float beer = exp( depth * -4.0 );
				float powder = 1.0 - beer * beer; // beer*beer == exp(-8*depth)
				float shade = mix( 0.45, 1.0, clamp( beer * powder * 2.6, 0.0, 1.0 ) ); // 2.6 = 1/0.385, normalizes beer*powder peak to 1

				// Henyey-Greenstein forward lobe ( g = 0.7 ): silver lining on rims toward the sun
				float silver = clamp( 0.51 / pow( 1.49 - cosTheta * 1.4, 1.5 ), 0.0, 3.0 ); // 0.51=1-g^2, 1.49=1+g^2, 1.4=2g
				float edge = cloudMask * ( 1.0 - cloudMask ) * 4.0;

				vec3 cloudColor = skyAmbient + sunColor * shade;
				cloudColor += sunColor * silver * edge * 0.6;
				cloudColor *= max( dayFactor, 0.03 );

				// Cloud opacity via Beer's law: density sets how solid the clouds get
				float alpha = ( 1.0 - exp( depth * cloudDensity * -12.0 ) ) * horizonFade;

				// Occlude the sun disc/glow behind opaque cloud
				texColor -= L0 * 0.04 * alpha;

				// Composite through the atmosphere so distant clouds dissolve into haze
				vec3 cloudAerial = mix( texColor, cloudColor, Fex );
				texColor = mix( texColor, cloudAerial, alpha );

			}

			gl_FragColor = vec4( texColor, 1.0 );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>

		}`};var js={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`};var pn=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}},ty=new ri(-1,1,1,-1,0,1),kc=class extends gt{constructor(){super(),this.setAttribute("position",new $e([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new $e([0,2,0,0,2,0],2))}},ny=new kc,Ei=class{constructor(e){this._mesh=new je(ny,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,ty)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}};var Zs=class extends pn{constructor(e,t="tDiffuse"){super(),this.textureID=t,this.uniforms=null,this.material=null,e instanceof dt?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=In.clone(e.uniforms),this.material=new dt({name:e.name!==void 0?e.name:"unspecified",defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new Ei(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}};var ia=class extends pn{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){let s=e.getContext(),r=e.state;r.buffers.color.setMask(!1),r.buffers.depth.setMask(!1),r.buffers.color.setLocked(!0),r.buffers.depth.setLocked(!0);let a,o;this.inverse?(a=0,o=1):(a=1,o=0),r.buffers.stencil.setTest(!0),r.buffers.stencil.setOp(s.REPLACE,s.REPLACE,s.REPLACE),r.buffers.stencil.setFunc(s.ALWAYS,a,4294967295),r.buffers.stencil.setClear(o),r.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),r.buffers.color.setLocked(!1),r.buffers.depth.setLocked(!1),r.buffers.color.setMask(!0),r.buffers.depth.setMask(!0),r.buffers.stencil.setLocked(!1),r.buffers.stencil.setFunc(s.EQUAL,1,4294967295),r.buffers.stencil.setOp(s.KEEP,s.KEEP,s.KEEP),r.buffers.stencil.setLocked(!0)}},rl=class extends pn{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}};var al=class{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){let n=e.getSize(new Ee);this._width=n.width,this._height=n.height,t=new mt(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:_t}),t.texture.name="EffectComposer.rt1"}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new Zs(js),this.copyPass.material.blending=oi,this.timer=new Or}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());let t=this.renderer.getRenderTarget(),n=!1;for(let s=0,r=this.passes.length;s<r;s++){let a=this.passes[s];if(a.enabled!==!1){if(a.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(s),a.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),a.needsSwap){if(n){let o=this.renderer.getContext(),l=this.renderer.state.buffers.stencil;l.setFunc(o.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),l.setFunc(o.EQUAL,1,4294967295)}this.swapBuffers()}ia!==void 0&&(a instanceof ia?n=!0:a instanceof rl&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){let t=this.renderer.getSize(new Ee);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;let n=this._width*this._pixelRatio,s=this._height*this._pixelRatio;this.renderTarget1.setSize(n,s),this.renderTarget2.setSize(n,s);for(let r=0;r<this.passes.length;r++)this.passes[r].setSize(n,s)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}};var ol=class extends pn{constructor(e,t,n=null,s=null,r=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=s,this.clearAlpha=r,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new Te}render(e,t,n){let s=e.autoClear;e.autoClear=!1;let r,a;this.overrideMaterial!==null&&(a=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(r=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==!0&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(r),this.overrideMaterial!==null&&(this.scene.overrideMaterial=a),e.autoClear=s}};var Gd={name:"LuminosityHighPassShader",uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new Te(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`};var Ys=class i extends pn{constructor(e,t=1,n,s){super(),this.strength=t,this.radius=n,this.threshold=s,this.resolution=e!==void 0?new Ee(e.x,e.y):new Ee(256,256),this.clearColor=new Te(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let r=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);this.renderTargetBright=new mt(r,a,{type:_t,depthBuffer:!1}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let u=0;u<this.nMips;u++){let h=new mt(r,a,{type:_t,depthBuffer:!1});h.texture.name="UnrealBloomPass.h"+u,h.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(h);let d=new mt(r,a,{type:_t,depthBuffer:!1});d.texture.name="UnrealBloomPass.v"+u,d.texture.generateMipmaps=!1,this.renderTargetsVertical.push(d),r=Math.round(r/2),a=Math.round(a/2)}let o=Gd;this.highPassUniforms=In.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=s,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new dt({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];let l=[6,10,14,18,22];r=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);for(let u=0;u<this.nMips;u++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(l[u])),this.separableBlurMaterials[u].uniforms.invSize.value=new Ee(1/r,1/a),r=Math.round(r/2),a=Math.round(a/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let c=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=c,this.bloomTintColors=[new D(1,1,1),new D(1,1,1),new D(1,1,1),new D(1,1,1),new D(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=In.clone(js.uniforms),this.blendMaterial=new dt({uniforms:this.copyUniforms,vertexShader:js.vertexShader,fragmentShader:js.fragmentShader,premultipliedAlpha:!0,blending:qi,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new Te,this._oldClearAlpha=1,this._basic=new Wt,this._fsQuad=new Ei(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),s=Math.round(t/2);this.renderTargetBright.setSize(n,s);for(let r=0;r<this.nMips;r++)this.renderTargetsHorizontal[r].setSize(n,s),this.renderTargetsVertical[r].setSize(n,s),this.separableBlurMaterials[r].uniforms.invSize.value=new Ee(1/n,1/s),n=Math.round(n/2),s=Math.round(s/2)}render(e,t,n,s,r){e.getClearColor(this._oldClearColor),this._oldClearAlpha=e.getClearAlpha();let a=e.autoClear;e.autoClear=!1,e.setClearColor(this.clearColor,0),r&&e.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=n.texture,e.setRenderTarget(null),e.clear(),this._fsQuad.render(e)),this.highPassUniforms.tDiffuse.value=n.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,e.setRenderTarget(this.renderTargetBright),e.clear(),this._fsQuad.render(e);let o=this.renderTargetBright;for(let l=0;l<this.nMips;l++)this._fsQuad.material=this.separableBlurMaterials[l],this.separableBlurMaterials[l].uniforms.colorTexture.value=o.texture,this.separableBlurMaterials[l].uniforms.direction.value=i.BlurDirectionX,e.setRenderTarget(this.renderTargetsHorizontal[l]),e.clear(),this._fsQuad.render(e),this.separableBlurMaterials[l].uniforms.colorTexture.value=this.renderTargetsHorizontal[l].texture,this.separableBlurMaterials[l].uniforms.direction.value=i.BlurDirectionY,e.setRenderTarget(this.renderTargetsVertical[l]),e.clear(),this._fsQuad.render(e),o=this.renderTargetsVertical[l];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,e.setRenderTarget(this.renderTargetsHorizontal[0]),e.clear(),this._fsQuad.render(e),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,r&&e.state.buffers.stencil.setTest(!0),this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(n),this._fsQuad.render(e)),e.setClearColor(this._oldClearColor,this._oldClearAlpha),e.autoClear=a}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let a=0;a<e;a++)t.push(.39894*Math.exp(-.5*a*a/(n*n))/n);let s=[],r=[];for(let a=1;a<e;a+=2){let o=t[a],l=a+1<e?t[a+1]:0,c=o+l;s.push((a*o+(a+1)*l)/c),r.push(c)}return new dt({defines:{KERNEL_PAIRS:s.length},uniforms:{colorTexture:{value:null},invSize:{value:new Ee(.5,.5)},direction:{value:new Ee(.5,.5)},centerWeight:{value:t[0]},gaussianOffsets:{value:s},gaussianWeights:{value:r}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				#include <common>

				varying vec2 vUv;

				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float centerWeight;
				uniform float gaussianOffsets[KERNEL_PAIRS];
				uniform float gaussianWeights[KERNEL_PAIRS];

				void main() {

					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * centerWeight;

					for ( int i = 0; i < KERNEL_PAIRS; i ++ ) {

						vec2 uvOffset = direction * invSize * gaussianOffsets[ i ];
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += ( sample1 + sample2 ) * gaussianWeights[ i ];

					}

					gl_FragColor = vec4( diffuseSum, 1.0 );

				}`})}_getCompositeMaterial(e){return new dt({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				varying vec2 vUv;

				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor( const in float factor ) {

					float mirrorFactor = 1.2 - factor;
					return mix( factor, mirrorFactor, bloomRadius );

				}

				void main() {

					// 3.0 for backwards compatibility with previous alpha-based intensity
					vec3 bloom = 3.0 * bloomStrength * (
						lerpBloomFactor( bloomFactors[ 0 ] ) * bloomTintColors[ 0 ] * texture2D( blurTexture1, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 1 ] ) * bloomTintColors[ 1 ] * texture2D( blurTexture2, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 2 ] ) * bloomTintColors[ 2 ] * texture2D( blurTexture3, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 3 ] ) * bloomTintColors[ 3 ] * texture2D( blurTexture4, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 4 ] ) * bloomTintColors[ 4 ] * texture2D( blurTexture5, vUv ).rgb
					);

					float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );
					gl_FragColor = vec4( bloom, bloomAlpha );

				}`})}};Ys.BlurDirectionX=new Ee(1,0);Ys.BlurDirectionY=new Ee(0,1);var sa={name:"OutputShader",uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`};var ll=class extends pn{constructor(){super(),this.isOutputPass=!0,this.uniforms=In.clone(sa.uniforms),this.material=new Us({name:sa.name,uniforms:this.uniforms,vertexShader:sa.vertexShader,fragmentShader:sa.fragmentShader}),this._fsQuad=new Ei(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},Ve.getTransfer(this._outputColorSpace)===Je&&(this.material.defines.SRGB_TRANSFER=""),this._toneMapping===kr?this.material.defines.LINEAR_TONE_MAPPING="":this._toneMapping===zr?this.material.defines.REINHARD_TONE_MAPPING="":this._toneMapping===Gr?this.material.defines.CINEON_TONE_MAPPING="":this._toneMapping===Ki?this.material.defines.ACES_FILMIC_TONE_MAPPING="":this._toneMapping===Wr?this.material.defines.AGX_TONE_MAPPING="":this._toneMapping===qr?this.material.defines.NEUTRAL_TONE_MAPPING="":this._toneMapping===Hr&&(this.material.defines.CUSTOM_TONE_MAPPING=""),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}};var Hd="data:image/jpeg;base64,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";function zc(i,e){if(e===gc)return console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles."),i;if(e===Ws||e===Qr){let t=i.getIndex();if(t===null){let r=[],a=i.getAttribute("position");if(a!==void 0){for(let o=0;o<a.count;o++)r.push(o);i.setIndex(r),t=i.getIndex()}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."),i}let n=t.count-2,s=[];if(e===Ws)for(let r=1;r<=n;r++)s.push(t.getX(0)),s.push(t.getX(r)),s.push(t.getX(r+1));else for(let r=0;r<n;r++)r%2===0?(s.push(t.getX(r)),s.push(t.getX(r+1)),s.push(t.getX(r+2))):(s.push(t.getX(r+2)),s.push(t.getX(r+1)),s.push(t.getX(r)));return s.length/3!==n&&console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles."),i.setIndex(s),i.clearGroups(),i}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:",e),i}function Wd(i){let e=new Map,t=new Map,n=i.clone();return qd(i,n,function(s,r){e.set(r,s),t.set(s,r)}),n.traverse(function(s){if(!s.isSkinnedMesh)return;let r=s,a=e.get(s),o=a.skeleton.bones;r.skeleton=a.skeleton.clone(),r.bindMatrix.copy(a.bindMatrix),r.skeleton.bones=o.map(function(l){return t.get(l)}),r.bind(r.skeleton,r.bindMatrix)}),n}function qd(i,e,t){t(i,e);for(let n=0;n<i.children.length;n++)qd(i.children[n],e.children[n],t)}var cl=class extends On{constructor(e){super(e),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(t){return new jc(t)}),this.register(function(t){return new Zc(t)}),this.register(function(t){return new Yc(t)}),this.register(function(t){return new ru(t)}),this.register(function(t){return new au(t)}),this.register(function(t){return new ou(t)}),this.register(function(t){return new Qc(t)}),this.register(function(t){return new $c(t)}),this.register(function(t){return new eu(t)}),this.register(function(t){return new tu(t)}),this.register(function(t){return new Kc(t)}),this.register(function(t){return new nu(t)}),this.register(function(t){return new Jc(t)}),this.register(function(t){return new su(t)}),this.register(function(t){return new iu(t)}),this.register(function(t){return new qc(t)}),this.register(function(t){return new ul(t,He.EXT_MESHOPT_COMPRESSION)}),this.register(function(t){return new ul(t,He.KHR_MESHOPT_COMPRESSION)}),this.register(function(t){return new lu(t)})}load(e,t,n,s){let r=this,a;if(this.resourcePath!=="")a=this.resourcePath;else if(this.path!==""){let c=ai.extractUrlBase(e);a=ai.resolveURL(c,this.path)}else a=ai.extractUrlBase(e);this.manager.itemStart(e);let o=function(c){s?s(c):console.error(c),r.manager.itemError(e),r.manager.itemEnd(e)},l=new Ds(this.manager);l.setPriority(this.priority),l.setCache(this.cache),l.setPath(this.path),l.setResponseType("arraybuffer"),l.setRequestHeader(this.requestHeader),l.setWithCredentials(this.withCredentials),l.load(e,function(c){try{r.parse(c,a,function(u){t(u),r.manager.itemEnd(e)},o)}catch(u){o(u)}},n,o)}setDRACOLoader(e){return this.dracoLoader=e,this}setKTX2Loader(e){return this.ktx2Loader=e,this}setMeshoptDecoder(e){return this.meshoptDecoder=e,this}register(e){return this.pluginCallbacks.indexOf(e)===-1&&this.pluginCallbacks.push(e),this}unregister(e){return this.pluginCallbacks.indexOf(e)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(e),1),this}parse(e,t,n,s){let r,a={},o={},l=new TextDecoder;if(typeof e=="string")r=JSON.parse(e);else if(e instanceof ArrayBuffer)if(l.decode(new Uint8Array(e,0,4))===Yd){try{a[He.KHR_BINARY_GLTF]=new cu(e)}catch(h){s&&s(h);return}r=JSON.parse(a[He.KHR_BINARY_GLTF].content)}else r=JSON.parse(l.decode(e));else r=e;if(r.asset===void 0||r.asset.version[0]<2){s&&s(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));return}let c=new gu(r,{path:t||this.resourcePath||"",crossOrigin:this.crossOrigin,priority:this.priority,cache:this.cache,withCredentials:this.withCredentials,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});c.fileLoader.setRequestHeader(this.requestHeader);for(let u=0;u<this.pluginCallbacks.length;u++){let h=this.pluginCallbacks[u](c);h.name||console.error("THREE.GLTFLoader: Invalid plugin found: missing name"),o[h.name]=h,a[h.name]=!0}if(r.extensionsUsed)for(let u=0;u<r.extensionsUsed.length;++u){let h=r.extensionsUsed[u],d=r.extensionsRequired||[];switch(h){case He.KHR_MATERIALS_UNLIT:a[h]=new Xc;break;case He.KHR_DRACO_MESH_COMPRESSION:a[h]=new uu(r,this.dracoLoader);break;case He.KHR_TEXTURE_TRANSFORM:a[h]=new hu;break;case He.KHR_MESH_QUANTIZATION:a[h]=new du;break;default:d.indexOf(h)>=0&&o[h]===void 0&&console.warn('THREE.GLTFLoader: Unknown extension "'+h+'".')}}c.setExtensions(a),c.setPlugins(o),c.parse(n,s)}parseAsync(e,t){let n=this;return new Promise(function(s,r){n.parse(e,t,s,r)})}};function iy(){let i={};return{get:function(e){return i[e]},add:function(e,t){i[e]=t},remove:function(e){delete i[e]},removeAll:function(){i={}}}}function ft(i,e,t){let n=i.json.materials[e];return n.extensions&&n.extensions[t]?n.extensions[t]:null}var He={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DIFFUSE_ROUGHNESS:"KHR_materials_diffuse_roughness",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",KHR_MESHOPT_COMPRESSION:"KHR_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"},qc=class{constructor(e){this.parser=e,this.name=He.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){let e=this.parser,t=this.parser.json.nodes||[];for(let n=0,s=t.length;n<s;n++){let r=t[n];r.extensions&&r.extensions[this.name]&&r.extensions[this.name].light!==void 0&&e._addNodeRef(this.cache,r.extensions[this.name].light)}}_loadLight(e){let t=this.parser,n="light:"+e,s=t.cache.get(n);if(s)return s;let r=t.json,l=((r.extensions&&r.extensions[this.name]||{}).lights||[])[e],c,u=new Te(16777215);l.color!==void 0&&u.setRGB(l.color[0],l.color[1],l.color[2],Yt);let h=l.range!==void 0?l.range:0;switch(l.type){case"directional":c=new Hi(u),c.target.position.set(0,0,-1),c.add(c.target);break;case"point":c=new Ur(u),c.distance=h;break;case"spot":c=new Lr(u),c.distance=h,l.spot=l.spot||{},l.spot.innerConeAngle=l.spot.innerConeAngle!==void 0?l.spot.innerConeAngle:0,l.spot.outerConeAngle=l.spot.outerConeAngle!==void 0?l.spot.outerConeAngle:Math.PI/4,c.angle=l.spot.outerConeAngle,c.penumbra=1-l.spot.innerConeAngle/l.spot.outerConeAngle,c.target.position.set(0,0,-1),c.add(c.target);break;default:throw new Error("THREE.GLTFLoader: Unexpected light type: "+l.type)}return c.position.set(0,0,0),zn(c,l),l.intensity!==void 0&&(c.intensity=l.intensity),c.name=t.createUniqueName(l.name||"light_"+e),s=Promise.resolve(c),t.cache.add(n,s),s}getDependency(e,t){if(e==="light")return this._loadLight(t)}createNodeAttachment(e){let t=this,n=this.parser,r=n.json.nodes[e],o=(r.extensions&&r.extensions[this.name]||{}).light;return o===void 0?null:this._loadLight(o).then(function(l){return n._getNodeRef(t.cache,o,l)})}},Xc=class{constructor(){this.name=He.KHR_MATERIALS_UNLIT}getMaterialType(){return Wt}extendParams(e,t,n){let s=[];e.color=new Te(1,1,1),e.opacity=1;let r=t.pbrMetallicRoughness;if(r){if(Array.isArray(r.baseColorFactor)){let a=r.baseColorFactor;e.color.setRGB(a[0],a[1],a[2],Yt),e.opacity=a[3]}r.baseColorTexture!==void 0&&s.push(n.assignTexture(e,"map",r.baseColorTexture,At))}return Promise.all(s)}},Kc=class{constructor(e){this.parser=e,this.name=He.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(e,t){let n=ft(this.parser,e,this.name);return n===null||n.emissiveStrength!==void 0&&(t.emissiveIntensity=n.emissiveStrength),Promise.resolve()}},jc=class{constructor(e){this.parser=e,this.name=He.KHR_MATERIALS_CLEARCOAT}getMaterialType(e){return ft(this.parser,e,this.name)!==null?Qt:null}extendMaterialParams(e,t){let n=ft(this.parser,e,this.name);if(n===null)return Promise.resolve();let s=[];if(n.clearcoatFactor!==void 0&&(t.clearcoat=n.clearcoatFactor),n.clearcoatTexture!==void 0&&s.push(this.parser.assignTexture(t,"clearcoatMap",n.clearcoatTexture)),n.clearcoatRoughnessFactor!==void 0&&(t.clearcoatRoughness=n.clearcoatRoughnessFactor),n.clearcoatRoughnessTexture!==void 0&&s.push(this.parser.assignTexture(t,"clearcoatRoughnessMap",n.clearcoatRoughnessTexture)),n.clearcoatNormalTexture!==void 0&&(s.push(this.parser.assignTexture(t,"clearcoatNormalMap",n.clearcoatNormalTexture)),n.clearcoatNormalTexture.scale!==void 0)){let r=n.clearcoatNormalTexture.scale;t.clearcoatNormalScale=new Ee(r,r)}return Promise.all(s)}},Zc=class{constructor(e){this.parser=e,this.name=He.KHR_MATERIALS_DIFFUSE_ROUGHNESS}getMaterialType(e){return ft(this.parser,e,this.name)!==null?Qt:null}extendMaterialParams(e,t){let n=ft(this.parser,e,this.name);if(n===null)return Promise.resolve();let s=[];return t.diffuseRoughness=n.diffuseRoughnessFactor!==void 0?n.diffuseRoughnessFactor:0,n.diffuseRoughnessTexture!==void 0&&s.push(this.parser.assignTexture(t,"diffuseRoughnessMap",n.diffuseRoughnessTexture)),Promise.all(s)}},Yc=class{constructor(e){this.parser=e,this.name=He.KHR_MATERIALS_DISPERSION}getMaterialType(e){return ft(this.parser,e,this.name)!==null?Qt:null}extendMaterialParams(e,t){let n=ft(this.parser,e,this.name);return n===null||(t.dispersion=n.dispersion!==void 0?n.dispersion:0),Promise.resolve()}},Jc=class{constructor(e){this.parser=e,this.name=He.KHR_MATERIALS_IRIDESCENCE}getMaterialType(e){return ft(this.parser,e,this.name)!==null?Qt:null}extendMaterialParams(e,t){let n=ft(this.parser,e,this.name);if(n===null)return Promise.resolve();let s=[];return n.iridescenceFactor!==void 0&&(t.iridescence=n.iridescenceFactor),n.iridescenceTexture!==void 0&&s.push(this.parser.assignTexture(t,"iridescenceMap",n.iridescenceTexture)),n.iridescenceIor!==void 0&&(t.iridescenceIOR=n.iridescenceIor),n.iridescenceThicknessMinimum!==void 0&&(t.iridescenceThicknessMinimum=n.iridescenceThicknessMinimum),n.iridescenceThicknessMaximum!==void 0&&(t.iridescenceThicknessMaximum=n.iridescenceThicknessMaximum),n.iridescenceThicknessTexture!==void 0&&s.push(this.parser.assignTexture(t,"iridescenceThicknessMap",n.iridescenceThicknessTexture)),Promise.all(s)}},Qc=class{constructor(e){this.parser=e,this.name=He.KHR_MATERIALS_SHEEN}getMaterialType(e){return ft(this.parser,e,this.name)!==null?Qt:null}extendMaterialParams(e,t){let n=ft(this.parser,e,this.name);if(n===null)return Promise.resolve();let s=[];if(t.sheenColor=new Te(0,0,0),t.sheenRoughness=0,t.sheen=1,n.sheenColorFactor!==void 0){let r=n.sheenColorFactor;t.sheenColor.setRGB(r[0],r[1],r[2],Yt)}return n.sheenRoughnessFactor!==void 0&&(t.sheenRoughness=n.sheenRoughnessFactor),n.sheenColorTexture!==void 0&&s.push(this.parser.assignTexture(t,"sheenColorMap",n.sheenColorTexture,At)),n.sheenRoughnessTexture!==void 0&&s.push(this.parser.assignTexture(t,"sheenRoughnessMap",n.sheenRoughnessTexture)),Promise.all(s)}},$c=class{constructor(e){this.parser=e,this.name=He.KHR_MATERIALS_TRANSMISSION}getMaterialType(e){return ft(this.parser,e,this.name)!==null?Qt:null}extendMaterialParams(e,t){let n=ft(this.parser,e,this.name);if(n===null)return Promise.resolve();let s=[];return n.transmissionFactor!==void 0&&(t.transmission=n.transmissionFactor),n.transmissionTexture!==void 0&&s.push(this.parser.assignTexture(t,"transmissionMap",n.transmissionTexture)),Promise.all(s)}},eu=class{constructor(e){this.parser=e,this.name=He.KHR_MATERIALS_VOLUME}getMaterialType(e){return ft(this.parser,e,this.name)!==null?Qt:null}extendMaterialParams(e,t){let n=ft(this.parser,e,this.name);if(n===null)return Promise.resolve();let s=[];t.thickness=n.thicknessFactor!==void 0?n.thicknessFactor:0,n.thicknessTexture!==void 0&&s.push(this.parser.assignTexture(t,"thicknessMap",n.thicknessTexture)),t.attenuationDistance=n.attenuationDistance||1/0;let r=n.attenuationColor||[1,1,1];return t.attenuationColor=new Te().setRGB(r[0],r[1],r[2],Yt),Promise.all(s)}},tu=class{constructor(e){this.parser=e,this.name=He.KHR_MATERIALS_IOR}getMaterialType(e){return ft(this.parser,e,this.name)!==null?Qt:null}extendMaterialParams(e,t){let n=ft(this.parser,e,this.name);return n===null||(t.ior=n.ior!==void 0?n.ior:1.5,t.ior===0&&(t.ior=1e3)),Promise.resolve()}},nu=class{constructor(e){this.parser=e,this.name=He.KHR_MATERIALS_SPECULAR}getMaterialType(e){return ft(this.parser,e,this.name)!==null?Qt:null}extendMaterialParams(e,t){let n=ft(this.parser,e,this.name);if(n===null)return Promise.resolve();let s=[];t.specularIntensity=n.specularFactor!==void 0?n.specularFactor:1,n.specularTexture!==void 0&&s.push(this.parser.assignTexture(t,"specularIntensityMap",n.specularTexture));let r=n.specularColorFactor||[1,1,1];return t.specularColor=new Te().setRGB(r[0],r[1],r[2],Yt),n.specularColorTexture!==void 0&&s.push(this.parser.assignTexture(t,"specularColorMap",n.specularColorTexture,At)),Promise.all(s)}},iu=class{constructor(e){this.parser=e,this.name=He.EXT_MATERIALS_BUMP}getMaterialType(e){return ft(this.parser,e,this.name)!==null?Qt:null}extendMaterialParams(e,t){let n=ft(this.parser,e,this.name);if(n===null)return Promise.resolve();let s=[];return t.bumpScale=n.bumpFactor!==void 0?n.bumpFactor:1,n.bumpTexture!==void 0&&s.push(this.parser.assignTexture(t,"bumpMap",n.bumpTexture)),Promise.all(s)}},su=class{constructor(e){this.parser=e,this.name=He.KHR_MATERIALS_ANISOTROPY}getMaterialType(e){return ft(this.parser,e,this.name)!==null?Qt:null}extendMaterialParams(e,t){let n=ft(this.parser,e,this.name);if(n===null)return Promise.resolve();let s=[];return n.anisotropyStrength!==void 0&&(t.anisotropy=n.anisotropyStrength),n.anisotropyRotation!==void 0&&(t.anisotropyRotation=n.anisotropyRotation),n.anisotropyTexture!==void 0&&s.push(this.parser.assignTexture(t,"anisotropyMap",n.anisotropyTexture)),Promise.all(s)}},ru=class{constructor(e){this.parser=e,this.name=He.KHR_TEXTURE_BASISU}loadTexture(e){let t=this.parser,n=t.json,s=n.textures[e];if(!s.extensions||!s.extensions[this.name])return null;let r=s.extensions[this.name],a=t.options.ktx2Loader;if(!a){if(n.extensionsRequired&&n.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");return null}return t.loadTextureImage(e,r.source,a)}},au=class{constructor(e){this.parser=e,this.name=He.EXT_TEXTURE_WEBP}loadTexture(e){let t=this.name,n=this.parser,s=n.json,r=s.textures[e];if(!r.extensions||!r.extensions[t])return null;let a=r.extensions[t],o=s.images[a.source],l=n.textureLoader;if(o.uri){let c=n.options.manager.getHandler(o.uri);c!==null&&(l=c)}return n.loadTextureImage(e,a.source,l)}},ou=class{constructor(e){this.parser=e,this.name=He.EXT_TEXTURE_AVIF}loadTexture(e){let t=this.name,n=this.parser,s=n.json,r=s.textures[e];if(!r.extensions||!r.extensions[t])return null;let a=r.extensions[t],o=s.images[a.source],l=n.textureLoader;if(o.uri){let c=n.options.manager.getHandler(o.uri);c!==null&&(l=c)}return n.loadTextureImage(e,a.source,l)}},ul=class{constructor(e,t){this.name=t,this.parser=e}loadBufferView(e){let t=this.parser.json,n=t.bufferViews[e];if(n.extensions&&n.extensions[this.name]){let s=n.extensions[this.name],r=this.parser.getDependency("buffer",s.buffer),a=this.parser.options.meshoptDecoder;if(!a||!a.supported){if(t.extensionsRequired&&t.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");return null}return r.then(function(o){let l=s.byteOffset||0,c=s.byteLength||0,u=s.count,h=s.byteStride,d=new Uint8Array(o,l,c);return a.decodeGltfBufferAsync?a.decodeGltfBufferAsync(u,h,d,s.mode,s.filter).then(function(f){return f.buffer}):a.ready.then(function(){let f=new ArrayBuffer(u*h);return a.decodeGltfBuffer(new Uint8Array(f),u,h,d,s.mode,s.filter),f})})}else return null}},lu=class{constructor(e){this.name=He.EXT_MESH_GPU_INSTANCING,this.parser=e}createNodeMesh(e){let t=this.parser.json,n=t.nodes[e];if(!n.extensions||!n.extensions[this.name]||n.mesh===void 0)return null;let s=t.meshes[n.mesh];for(let c of s.primitives)if(c.mode!==bn.TRIANGLES&&c.mode!==bn.TRIANGLE_STRIP&&c.mode!==bn.TRIANGLE_FAN&&c.mode!==void 0)return null;let a=n.extensions[this.name].attributes,o=[],l={};for(let c in a)o.push(this.parser.getDependency("accessor",a[c]).then(u=>(l[c]=u,l[c])));return o.length<1?null:(o.push(this.parser.createNodeMesh(e)),Promise.all(o).then(c=>{let u=c.pop(),h=u.isGroup?u.children:[u],d=c[0].count,f=[];for(let g of h){let _=new Le,m=new D,p=new hn,y=new D(1,1,1),w=new Sr(g.geometry,g.material,d);for(let b=0;b<d;b++)l.TRANSLATION&&m.fromBufferAttribute(l.TRANSLATION,b),l.ROTATION&&p.fromBufferAttribute(l.ROTATION,b),l.SCALE&&y.fromBufferAttribute(l.SCALE,b),w.setMatrixAt(b,_.compose(m,p,y));let M=null;for(let b in l)if(b==="_COLOR_0"){let E=l[b];w.instanceColor=new $n(E.array,E.itemSize,E.normalized)}else if(b!=="TRANSLATION"&&b!=="ROTATION"&&b!=="SCALE"){if(M===null){let x=w.geometry;M=new gt,M.name=x.name;for(let T in x.attributes)M.setAttribute(T,x.attributes[T]);for(let T in x.morphAttributes)M.morphAttributes[T]=x.morphAttributes[T];x.index!==null&&M.setIndex(x.index),M.morphTargetsRelative=x.morphTargetsRelative;for(let T of x.groups)M.addGroup(T.start,T.count,T.materialIndex);x.boundingBox!==null&&(M.boundingBox=x.boundingBox.clone()),x.boundingSphere!==null&&(M.boundingSphere=x.boundingSphere.clone()),M.drawRange.start=x.drawRange.start,M.drawRange.count=x.drawRange.count,M.userData=Object.assign({},x.userData),w.geometry=M}let E=l[b];M.setAttribute(b,new $n(E.array,E.itemSize,E.normalized))}ht.prototype.copy.call(w,g),this.parser.assignFinalMaterial(w),f.push(w)}return u.isGroup?(u.clear(),u.add(...f),u):f[0]}))}},Yd="glTF",ra=12,Xd={JSON:1313821514,BIN:5130562},cu=class{constructor(e){this.name=He.KHR_BINARY_GLTF,this.content=null,this.body=null;let t=new DataView(e,0,ra),n=new TextDecoder;if(this.header={magic:n.decode(new Uint8Array(e.slice(0,4))),version:t.getUint32(4,!0),length:t.getUint32(8,!0)},this.header.magic!==Yd)throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");if(this.header.version<2)throw new Error("THREE.GLTFLoader: Legacy binary file detected.");let s=this.header.length-ra,r=new DataView(e,ra),a=0;for(;a<s;){let o=r.getUint32(a,!0);a+=4;let l=r.getUint32(a,!0);if(a+=4,l===Xd.JSON){let c=new Uint8Array(e,ra+a,o);this.content=n.decode(c)}else if(l===Xd.BIN){let c=ra+a;this.body=e.slice(c,c+o)}a+=o}if(this.content===null)throw new Error("THREE.GLTFLoader: JSON content not found.")}},uu=class{constructor(e,t){if(!t)throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=He.KHR_DRACO_MESH_COMPRESSION,this.json=e,this.dracoLoader=t,this.dracoLoader.preload()}decodePrimitive(e,t){let n=this.json,s=this.dracoLoader,r=e.extensions[this.name].bufferView,a=e.extensions[this.name].attributes,o={},l={},c={};for(let u in a){let h=pu[u]||u.toLowerCase();o[h]=a[u]}for(let u in e.attributes){let h=pu[u]||u.toLowerCase();if(a[u]!==void 0){let d=n.accessors[e.attributes[u]],f=Js[d.componentType];c[h]=f.name,l[h]=d.normalized===!0}}return t.getDependency("bufferView",r).then(function(u){return new Promise(function(h,d){s.decodeDracoFile(u,function(f){for(let g in f.attributes){let _=f.attributes[g],m=l[g];m!==void 0&&(_.normalized=m)}h(f)},o,c,Yt,d)})})}},hu=class{constructor(){this.name=He.KHR_TEXTURE_TRANSFORM}extendTexture(e,t){if((t.texCoord===void 0||t.texCoord===e.channel)&&t.offset===void 0&&t.rotation===void 0&&t.scale===void 0)return e;if(e=e.clone(),t.texCoord!==void 0&&(e.channel=t.texCoord),t.offset!==void 0&&e.offset.fromArray(t.offset),t.rotation!==void 0&&(e.rotation=t.rotation),t.scale!==void 0&&e.repeat.fromArray(t.scale),t.rotation!==void 0){let n=Math.cos(e.rotation),s=Math.sin(e.rotation);e.matrix.set(e.repeat.x*n,e.repeat.y*s,e.offset.x,-e.repeat.x*s,e.repeat.y*n,e.offset.y,0,0,1),e.matrixAutoUpdate=!1}return e.needsUpdate=!0,e}},du=class{constructor(){this.name=He.KHR_MESH_QUANTIZATION}},hl=class extends Dn{constructor(e,t,n,s){super(e,t,n,s)}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,s=this.valueSize,r=e*s*3+s;for(let a=0;a!==s;a++)t[a]=n[r+a];return t}interpolate_(e,t,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=o*2,c=o*3,u=s-t,h=(n-t)/u,d=h*h,f=d*h,g=e*c,_=g-c,m=-2*f+3*d,p=f-d,y=1-m,w=p-d+h;for(let M=0;M!==o;M++){let b=a[_+M+o],E=a[_+M+l]*u,x=a[g+M+o],T=a[g+M]*u;r[M]=y*b+w*E+m*x+p*T}return r}},sy=new hn,fu=class extends hl{interpolate_(e,t,n,s){let r=super.interpolate_(e,t,n,s);return sy.fromArray(r).normalize().toArray(r),r}},bn={FLOAT:5126,FLOAT_MAT3:35675,FLOAT_MAT4:35676,FLOAT_VEC2:35664,FLOAT_VEC3:35665,FLOAT_VEC4:35666,LINEAR:9729,REPEAT:10497,SAMPLER_2D:35678,POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6,UNSIGNED_BYTE:5121,UNSIGNED_SHORT:5123},Js={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},Kd={9728:vt,9729:ut,9984:mo,9985:zs,9986:Zi,9987:an},jd={33071:_n,33648:_s,10497:Rn},Gc={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},pu={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},Ai={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},ry={CUBICSPLINE:void 0,LINEAR:Fi,STEP:Oi},Hc={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};function ay(i){return i.DefaultMaterial===void 0&&(i.DefaultMaterial=new qt({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:Mn})),i.DefaultMaterial}function es(i,e,t){for(let n in t.extensions)i[n]===void 0&&(e.userData.gltfExtensions=e.userData.gltfExtensions||{},e.userData.gltfExtensions[n]=t.extensions[n])}function zn(i,e){e.extras!==void 0&&(typeof e.extras=="object"?Object.assign(i.userData,e.extras):console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, "+e.extras))}function oy(i,e,t){let n=!1,s=!1,r=!1;for(let c=0,u=e.length;c<u;c++){let h=e[c];if(h.POSITION!==void 0&&(n=!0),h.NORMAL!==void 0&&(s=!0),h.COLOR_0!==void 0&&(r=!0),n&&s&&r)break}if(!n&&!s&&!r)return Promise.resolve(i);let a=[],o=[],l=[];for(let c=0,u=e.length;c<u;c++){let h=e[c];if(n){let d=h.POSITION!==void 0?t.getDependency("accessor",h.POSITION):i.attributes.position;a.push(d)}if(s){let d=h.NORMAL!==void 0?t.getDependency("accessor",h.NORMAL):i.attributes.normal;o.push(d)}if(r){let d=h.COLOR_0!==void 0?t.getDependency("accessor",h.COLOR_0):i.attributes.color;l.push(d)}}return Promise.all([Promise.all(a),Promise.all(o),Promise.all(l)]).then(function(c){let u=c[0],h=c[1],d=c[2];return n&&(i.morphAttributes.position=u),s&&(i.morphAttributes.normal=h),r&&(i.morphAttributes.color=d),i.morphTargetsRelative=!0,i})}function ly(i,e){if(i.updateMorphTargets(),e.weights!==void 0)for(let t=0,n=e.weights.length;t<n;t++)i.morphTargetInfluences[t]=e.weights[t];if(e.extras&&Array.isArray(e.extras.targetNames)){let t=e.extras.targetNames;if(i.morphTargetInfluences.length===t.length){i.morphTargetDictionary={};for(let n=0,s=t.length;n<s;n++)i.morphTargetDictionary[t[n]]=n}else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")}}function cy(i){let e,t=i.extensions&&i.extensions[He.KHR_DRACO_MESH_COMPRESSION];if(t?e="draco:"+t.bufferView+":"+t.indices+":"+Wc(t.attributes):e=i.indices+":"+Wc(i.attributes)+":"+i.mode,i.targets!==void 0)for(let n=0,s=i.targets.length;n<s;n++)e+=":"+Wc(i.targets[n]);return e}function Wc(i){let e="",t=Object.keys(i).sort();for(let n=0,s=t.length;n<s;n++)e+=t[n]+":"+i[t[n]]+";";return e}function mu(i){switch(i){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}function uy(i){return i.search(/\.jpe?g($|\?)/i)>0||i.search(/^data\:image\/jpeg/)===0?"image/jpeg":i.search(/\.webp($|\?)/i)>0||i.search(/^data\:image\/webp/)===0?"image/webp":i.search(/\.ktx2($|\?)/i)>0||i.search(/^data\:image\/ktx2/)===0?"image/ktx2":"image/png"}var hy=new Le,gu=class{constructor(e={},t={}){this.json=e,this.extensions={},this.plugins={},this.options=t,this.cache=new iy,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let n=!1,s=-1,r=!1,a=-1;if(typeof navigator<"u"&&typeof navigator.userAgent<"u"){let o=navigator.userAgent;n=/^((?!chrome|android).)*safari/i.test(o)===!0;let l=o.match(/Version\/(\d+)/);s=n&&l?parseInt(l[1],10):-1,r=o.indexOf("Firefox")>-1,a=r?o.match(/Firefox\/([0-9]+)\./)[1]:-1}typeof createImageBitmap>"u"||n&&s<17||r&&a<98?(this.textureLoader=new Gi(this.options.manager),this.textureLoader.setPriority(this.options.priority),this.textureLoader.setCache(this.options.cache)):(this.textureLoader=new Dr(this.options.manager),this.textureLoader.setPriority(this.options.priority),this.textureLoader.setCache(this.options.cache)),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setWithCredentials(this.options.withCredentials),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new Ds(this.options.manager),this.fileLoader.setPriority(this.options.priority),this.fileLoader.setCache(this.options.cache),this.fileLoader.setResponseType("arraybuffer"),(this.options.withCredentials||this.options.crossOrigin==="use-credentials")&&this.fileLoader.setWithCredentials(!0)}setExtensions(e){this.extensions=e}setPlugins(e){this.plugins=e}parse(e,t){let n=this,s=this.json,r=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(a){return a._markDefs&&a._markDefs()}),Promise.all(this._invokeAll(function(a){return a.beforeRoot&&a.beforeRoot()})).then(function(){return Promise.all([n.getDependencies("scene"),n.getDependencies("animation"),n.getDependencies("camera")])}).then(function(a){let o={scene:a[0][s.scene||0],scenes:a[0],animations:a[1],cameras:a[2],asset:s.asset,parser:n,userData:{}};return es(r,o,s),zn(o,s),Promise.all(n._invokeAll(function(l){return l.afterRoot&&l.afterRoot(o)})).then(function(){for(let l of o.scenes)l.updateMatrixWorld();e(o)})}).catch(t)}_markDefs(){let e=this.json.nodes||[],t=this.json.skins||[],n=this.json.meshes||[];for(let s=0,r=t.length;s<r;s++){let a=t[s].joints;for(let o=0,l=a.length;o<l;o++)e[a[o]].isBone=!0}for(let s=0,r=e.length;s<r;s++){let a=e[s];a.mesh!==void 0&&(this._addNodeRef(this.meshCache,a.mesh),a.skin!==void 0&&(n[a.mesh].isSkinnedMesh=!0)),a.camera!==void 0&&this._addNodeRef(this.cameraCache,a.camera)}}_addNodeRef(e,t){t!==void 0&&(e.refs[t]===void 0&&(e.refs[t]=e.uses[t]=0),e.refs[t]++)}_getNodeRef(e,t,n){if(e.refs[t]<=1)return n;let s=n.clone(),r=(a,o)=>{let l=this.associations.get(a);l!=null&&this.associations.set(o,l);for(let[c,u]of a.children.entries())r(u,o.children[c])};return r(n,s),s.name+="_instance_"+e.uses[t]++,s}_invokeOne(e){let t=Object.values(this.plugins);t.push(this);for(let n=0;n<t.length;n++){let s=e(t[n]);if(s)return s}return null}_invokeAll(e){let t=Object.values(this.plugins);t.unshift(this);let n=[];for(let s=0;s<t.length;s++){let r=e(t[s]);r&&n.push(r)}return n}getDependency(e,t){let n=e+":"+t,s=this.cache.get(n);if(!s){switch(e){case"scene":s=this.loadScene(t);break;case"node":s=this._invokeOne(function(r){return r.loadNode&&r.loadNode(t)});break;case"mesh":s=this._invokeOne(function(r){return r.loadMesh&&r.loadMesh(t)});break;case"accessor":s=this.loadAccessor(t);break;case"bufferView":s=this._invokeOne(function(r){return r.loadBufferView&&r.loadBufferView(t)});break;case"buffer":s=this.loadBuffer(t);break;case"material":s=this._invokeOne(function(r){return r.loadMaterial&&r.loadMaterial(t)});break;case"texture":s=this._invokeOne(function(r){return r.loadTexture&&r.loadTexture(t)});break;case"skin":s=this.loadSkin(t);break;case"animation":s=this._invokeOne(function(r){return r.loadAnimation&&r.loadAnimation(t)});break;case"camera":s=this.loadCamera(t);break;default:if(s=this._invokeOne(function(r){return r!=this&&r.getDependency&&r.getDependency(e,t)}),!s)throw new Error("Unknown type: "+e);break}this.cache.add(n,s)}return s}getDependencies(e){let t=this.cache.get(e);if(!t){let n=this,s=this.json[e+(e==="mesh"?"es":"s")]||[];t=Promise.all(s.map(function(r,a){return n.getDependency(e,a)})),this.cache.add(e,t)}return t}loadBuffer(e){let t=this.json.buffers[e],n=this.fileLoader;if(t.type&&t.type!=="arraybuffer")throw new Error("THREE.GLTFLoader: "+t.type+" buffer type is not supported.");if(t.uri===void 0&&e===0)return Promise.resolve(this.extensions[He.KHR_BINARY_GLTF].body);let s=this.options;return new Promise(function(r,a){n.load(ai.resolveURL(t.uri,s.path),r,void 0,function(){a(new Error('THREE.GLTFLoader: Failed to load buffer "'+t.uri+'".'))})})}loadBufferView(e){let t=this.json.bufferViews[e];return this.getDependency("buffer",t.buffer).then(function(n){let s=t.byteLength||0,r=t.byteOffset||0;return n.slice(r,r+s)})}loadAccessor(e){let t=this,n=this.json,s=this.json.accessors[e];if(s.bufferView===void 0&&s.sparse===void 0){let a=Gc[s.type],o=Js[s.componentType],l=s.normalized===!0,c=new o(s.count*a);return Promise.resolve(new Bt(c,a,l))}let r=[];return s.bufferView!==void 0?r.push(this.getDependency("bufferView",s.bufferView)):r.push(null),s.sparse!==void 0&&(r.push(this.getDependency("bufferView",s.sparse.indices.bufferView)),r.push(this.getDependency("bufferView",s.sparse.values.bufferView))),Promise.all(r).then(function(a){let o=a[0],l=Gc[s.type],c=Js[s.componentType],u=c.BYTES_PER_ELEMENT,h=u*l,d=s.byteOffset||0,f=s.bufferView!==void 0?n.bufferViews[s.bufferView].byteStride:void 0,g=s.normalized===!0,_,m;if(f&&f!==h){let p=Math.floor(d/f),y="InterleavedBuffer:"+s.bufferView+":"+s.componentType+":"+p+":"+s.count,w=t.cache.get(y);w||(_=new c(o,p*f,s.count*f/u),w=new Cs(_,f/u),t.cache.add(y,w)),m=new Is(w,l,d%f/u,g)}else o===null?_=new c(s.count*l):_=new c(o,d,s.count*l),m=new Bt(_,l,g);if(s.sparse!==void 0){let p=Gc.SCALAR,y=Js[s.sparse.indices.componentType],w=s.sparse.indices.byteOffset||0,M=s.sparse.values.byteOffset||0,b=new y(a[1],w,s.sparse.count*p),E=new c(a[2],M,s.sparse.count*l);o!==null&&(m=new Bt(m.array.slice(),m.itemSize,m.normalized)),m.normalized=!1;for(let x=0,T=b.length;x<T;x++){let N=b[x];if(m.setX(N,E[x*l]),l>=2&&m.setY(N,E[x*l+1]),l>=3&&m.setZ(N,E[x*l+2]),l>=4&&m.setW(N,E[x*l+3]),l>=5)throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}m.normalized=g}return m})}loadTexture(e){let t=this.json,n=this.options,r=t.textures[e].source,a=t.images[r],o=this.textureLoader;if(a.uri){let l=n.manager.getHandler(a.uri);l!==null&&(o=l)}return this.loadTextureImage(e,r,o)}loadTextureImage(e,t,n){let s=this,r=this.json,a=r.textures[e],o=r.images[t],l=(o.uri||o.bufferView)+":"+a.sampler;if(this.textureCache[l])return this.textureCache[l];let c=this.loadImageSource(t,n).then(function(u){u.flipY=!1,u.name=a.name||o.name||"",u.name===""&&typeof o.uri=="string"&&o.uri.startsWith("data:image/")===!1&&(u.name=o.uri);let d=(r.samplers||{})[a.sampler]||{};return u.magFilter=Kd[d.magFilter]||ut,u.minFilter=Kd[d.minFilter]||an,u.wrapS=jd[d.wrapS]||Rn,u.wrapT=jd[d.wrapT]||Rn,u.generateMipmaps=!u.isCompressedTexture&&u.minFilter!==vt&&u.minFilter!==ut,s.associations.set(u,{textures:e}),u}).catch(function(){return null});return this.textureCache[l]=c,c}loadImageSource(e,t){let n=this,s=this.json,r=this.options;if(this.sourceCache[e]!==void 0)return this.sourceCache[e].then(d=>d.clone());let a=s.images[e],o=self.URL||self.webkitURL,l=a.uri||"",c=!1,u;if(t.isKTX2Loader===!0&&a.bufferView!==void 0)u=n.getDependency("bufferView",a.bufferView).then(function(d){return new Promise(function(f,g){t.parse(d,f,g)})});else{if(a.bufferView!==void 0)l=n.getDependency("bufferView",a.bufferView).then(function(d){c=!0;let f=new Blob([d],{type:a.mimeType});return l=o.createObjectURL(f),l});else if(a.uri===void 0)throw new Error("THREE.GLTFLoader: Image "+e+" is missing URI and bufferView");u=Promise.resolve(l).then(function(d){return new Promise(function(f,g){let _=f;t.isImageBitmapLoader===!0&&(_=function(m){let p=new Dt(m);p.needsUpdate=!0,f(p)}),t.load(ai.resolveURL(d,r.path),_,void 0,g)})})}let h=u.then(function(d){return c===!0&&o.revokeObjectURL(l),zn(d,a),d.userData.mimeType=a.mimeType||uy(a.uri),d}).catch(function(d){throw console.error("THREE.GLTFLoader: Couldn't load texture",l),d});return this.sourceCache[e]=h,h}assignTexture(e,t,n,s){let r=this;return this.getDependency("texture",n.index).then(function(a){if(!a)return null;if(n.texCoord!==void 0&&n.texCoord>0&&(a=a.clone(),a.channel=n.texCoord),r.extensions[He.KHR_TEXTURE_TRANSFORM]){let o=n.extensions!==void 0?n.extensions[He.KHR_TEXTURE_TRANSFORM]:void 0;if(o){let l=r.associations.get(a);a=r.extensions[He.KHR_TEXTURE_TRANSFORM].extendTexture(a,o),r.associations.set(a,l)}}return s!==void 0&&(a.colorSpace=s),e[t]=a,a})}assignFinalMaterial(e){let t=e.geometry,n=e.material,s=t.attributes.tangent===void 0,r=t.attributes.color!==void 0,a=t.attributes.normal===void 0;if(e.isPoints){let o="PointsMaterial:"+n.uuid,l=this.cache.get(o);l||(l=new Ls,sn.prototype.copy.call(l,n),l.color.copy(n.color),l.map=n.map,l.sizeAttenuation=!1,this.cache.add(o,l)),n=l}else if(e.isLine){let o="LineBasicMaterial:"+n.uuid,l=this.cache.get(o);l||(l=new Ns,sn.prototype.copy.call(l,n),l.color.copy(n.color),l.map=n.map,this.cache.add(o,l)),n=l}if(s||r||a){let o="ClonedMaterial:"+n.uuid+":";s&&(o+="derivative-tangents:"),r&&(o+="vertex-colors:"),a&&(o+="flat-shading:");let l=this.cache.get(o);l||(l=n.clone(),r&&(l.vertexColors=!0),a&&(l.flatShading=!0),s&&(l.normalScale&&(l.normalScale.y*=-1),l.clearcoatNormalScale&&(l.clearcoatNormalScale.y*=-1)),this.cache.add(o,l),this.associations.set(l,this.associations.get(n))),n=l}e.material=n}getMaterialType(){return qt}loadMaterial(e){let t=this,n=this.json,s=this.extensions,r=n.materials[e],a,o={},l=r.extensions||{},c=[];if(l[He.KHR_MATERIALS_UNLIT]){let h=s[He.KHR_MATERIALS_UNLIT];a=h.getMaterialType(),c.push(h.extendParams(o,r,t))}else{let h=r.pbrMetallicRoughness||{};if(o.color=new Te(1,1,1),o.opacity=1,Array.isArray(h.baseColorFactor)){let d=h.baseColorFactor;o.color.setRGB(d[0],d[1],d[2],Yt),o.opacity=d[3]}h.baseColorTexture!==void 0&&c.push(t.assignTexture(o,"map",h.baseColorTexture,At)),o.metalness=h.metallicFactor!==void 0?h.metallicFactor:1,o.roughness=h.roughnessFactor!==void 0?h.roughnessFactor:1,h.metallicRoughnessTexture!==void 0&&(c.push(t.assignTexture(o,"metalnessMap",h.metallicRoughnessTexture)),c.push(t.assignTexture(o,"roughnessMap",h.metallicRoughnessTexture))),a=this._invokeOne(function(d){return d.getMaterialType&&d.getMaterialType(e)}),c.push(Promise.all(this._invokeAll(function(d){return d.extendMaterialParams&&d.extendMaterialParams(e,o)})))}r.doubleSided===!0&&(o.side=Xt);let u=r.alphaMode||Hc.OPAQUE;if(u===Hc.BLEND?(o.transparent=!0,o.depthWrite=!1):(o.transparent=!1,u===Hc.MASK&&(o.alphaTest=r.alphaCutoff!==void 0?r.alphaCutoff:.5)),r.normalTexture!==void 0&&a!==Wt&&(c.push(t.assignTexture(o,"normalMap",r.normalTexture)),o.normalScale=new Ee(1,1),r.normalTexture.scale!==void 0)){let h=r.normalTexture.scale;o.normalScale.set(h,h)}if(r.occlusionTexture!==void 0&&a!==Wt&&(c.push(t.assignTexture(o,"aoMap",r.occlusionTexture)),r.occlusionTexture.strength!==void 0&&(o.aoMapIntensity=r.occlusionTexture.strength)),r.emissiveFactor!==void 0&&a!==Wt){let h=r.emissiveFactor;o.emissive=new Te().setRGB(h[0],h[1],h[2],Yt)}return r.emissiveTexture!==void 0&&a!==Wt&&c.push(t.assignTexture(o,"emissiveMap",r.emissiveTexture,At)),Promise.all(c).then(function(){let h=new a(o);return r.name&&(h.name=r.name),zn(h,r),t.associations.set(h,{materials:e}),r.extensions&&es(s,h,r),h})}createUniqueName(e){let t=st.sanitizeNodeName(e||"");return t in this.nodeNamesUsed?t+"_"+ ++this.nodeNamesUsed[t]:(this.nodeNamesUsed[t]=0,t)}loadGeometries(e){let t=this,n=this.extensions,s=this.primitiveCache;function r(o){return n[He.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(o,t).then(function(l){return Zd(l,o,t)})}let a=[];for(let o=0,l=e.length;o<l;o++){let c=e[o],u=cy(c),h=s[u];if(h)a.push(h.promise);else{let d;c.extensions&&c.extensions[He.KHR_DRACO_MESH_COMPRESSION]?d=r(c):d=Zd(new gt,c,t),c.mode===bn.TRIANGLE_STRIP?d=d.then(f=>zc(f,Qr)):c.mode===bn.TRIANGLE_FAN&&(d=d.then(f=>zc(f,Ws))),s[u]={primitive:c,promise:d},a.push(d)}}return Promise.all(a)}loadMesh(e){let t=this,n=this.json,s=this.extensions,r=n.meshes[e],a=r.primitives,o=[];for(let l=0,c=a.length;l<c;l++){let u=a[l].material===void 0?ay(this.cache):this.getDependency("material",a[l].material);o.push(u)}return o.push(t.loadGeometries(a)),Promise.all(o).then(async function(l){let c=l.slice(0,l.length-1),u=l[l.length-1],h=[];for(let f=0,g=u.length;f<g;f++){let _=u[f],m=a[f],p,y=c[f];if(m.mode===bn.TRIANGLES||m.mode===bn.TRIANGLE_STRIP||m.mode===bn.TRIANGLE_FAN||m.mode===void 0){let w=r.isSkinnedMesh===!0,M=_.hasAttribute("skinIndex")&&_.hasAttribute("skinWeight");w&&M===!1&&console.warn("THREE.GLTFLoader: Missing skinIndex or skinWeight attributes. Skinning disabled."),p=w&&M?new vr(_,y):new je(_,y),p.isSkinnedMesh===!0&&p.normalizeSkinWeights()}else if(m.mode===bn.LINES)p=new Mr(_,y);else if(m.mode===bn.LINE_STRIP)p=new Vi(_,y);else if(m.mode===bn.LINE_LOOP)p=new br(_,y);else if(m.mode===bn.POINTS)p=new Tr(_,y);else throw new Error("THREE.GLTFLoader: Primitive mode unsupported: "+m.mode);Object.keys(p.geometry.morphAttributes).length>0&&ly(p,r),p.name=t.createUniqueName(r.name||"mesh_"+e),zn(p,r),m.extensions&&es(s,p,m),t.assignFinalMaterial(p),h.push(p)}for(let f=0,g=h.length;f<g;f++)t.associations.set(h[f],{meshes:e,primitives:f});if(h.length===1)return r.extensions&&es(s,h[0],r),h[0];let d=new pt;r.extensions&&es(s,d,r),t.associations.set(d,{meshes:e});for(let f=0,g=h.length;f<g;f++)d.add(h[f]);return d})}loadCamera(e){let t,n=this.json.cameras[e],s=n[n.type];if(!s){console.warn("THREE.GLTFLoader: Missing camera parameters.");return}return n.type==="perspective"?t=new Tt(Ji.radToDeg(s.yfov),s.aspectRatio||1,s.znear||1,s.zfar||2e6):n.type==="orthographic"&&(t=new ri(-s.xmag,s.xmag,s.ymag,-s.ymag,s.znear,s.zfar)),n.name&&(t.name=this.createUniqueName(n.name)),zn(t,n),Promise.resolve(t)}loadSkin(e){let t=this.json.skins[e],n=[];for(let s=0,r=t.joints.length;s<r;s++)n.push(this._loadNodeShallow(t.joints[s]));return t.inverseBindMatrices!==void 0?n.push(this.getDependency("accessor",t.inverseBindMatrices)):n.push(null),Promise.all(n).then(function(s){let r=s.pop(),a=s,o=[],l=[];for(let c=0,u=a.length;c<u;c++){let h=a[c];if(h){o.push(h);let d=new Le;r!==null&&d.fromArray(r.array,c*16),l.push(d)}else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',t.joints[c])}return new _r(o,l)})}loadAnimation(e){let t=this.json,n=this,s=t.animations[e],r=s.name?s.name:"animation_"+e,a=[],o=[],l=[],c=[],u=[];for(let h=0,d=s.channels.length;h<d;h++){let f=s.channels[h],g=s.samplers[f.sampler],_=f.target,m=_.node,p=s.parameters!==void 0?s.parameters[g.input]:g.input,y=s.parameters!==void 0?s.parameters[g.output]:g.output;_.node!==void 0&&(a.push(this.getDependency("node",m)),o.push(this.getDependency("accessor",p)),l.push(this.getDependency("accessor",y)),c.push(g),u.push(_))}return Promise.all([Promise.all(a),Promise.all(o),Promise.all(l),Promise.all(c),Promise.all(u)]).then(function(h){let d=h[0],f=h[1],g=h[2],_=h[3],m=h[4],p=[];for(let w=0,M=d.length;w<M;w++){let b=d[w],E=f[w],x=g[w],T=_[w],N=m[w];if(b===void 0)continue;b.updateMatrix&&b.updateMatrix();let C=n._createAnimationTracks(b,E,x,T,N);if(C)for(let P=0;P<C.length;P++)p.push(C[P])}let y=new Pr(r,void 0,p);return zn(y,s),y})}createNodeMesh(e){let t=this.json,n=this,s=t.nodes[e];return s.mesh===void 0?null:n.getDependency("mesh",s.mesh).then(function(r){let a=n._getNodeRef(n.meshCache,s.mesh,r);return s.weights!==void 0&&a.traverse(function(o){if(o.isMesh)for(let l=0,c=s.weights.length;l<c;l++)o.morphTargetInfluences[l]=s.weights[l]}),a})}loadNode(e){let t=this.json,n=this,s=t.nodes[e],r=n._loadNodeShallow(e),a=[],o=s.children||[];for(let c=0,u=o.length;c<u;c++)a.push(n.getDependency("node",o[c]));let l=s.skin===void 0?Promise.resolve(null):n.getDependency("skin",s.skin);return Promise.all([r,Promise.all(a),l]).then(function(c){let u=c[0],h=c[1],d=c[2];d!==null&&u.traverse(function(f){f.isSkinnedMesh&&f.bind(d,hy)});for(let f=0,g=h.length;f<g;f++)u.add(h[f]);if(u.userData.pivot!==void 0&&h.length>0){let f=u.userData.pivot,g=h[0];u.pivot=new D().fromArray(f),u.position.x-=f[0],u.position.y-=f[1],u.position.z-=f[2],g.position.set(0,0,0),delete u.userData.pivot}return u})}_loadNodeShallow(e){let t=this.json,n=this.extensions,s=this;if(this.nodeCache[e]!==void 0)return this.nodeCache[e];let r=t.nodes[e],a=r.name?s.createUniqueName(r.name):"",o=[],l=s._invokeOne(function(c){return c.createNodeMesh&&c.createNodeMesh(e)});return l&&o.push(l),r.camera!==void 0&&o.push(s.getDependency("camera",r.camera).then(function(c){return s._getNodeRef(s.cameraCache,r.camera,c)})),s._invokeAll(function(c){return c.createNodeAttachment&&c.createNodeAttachment(e)}).forEach(function(c){o.push(c)}),this.nodeCache[e]=Promise.all(o).then(function(c){let u;if(r.isBone===!0?u=new Ps:c.length>1?u=new pt:c.length===1?u=c[0]:u=new ht,u!==c[0])for(let h=0,d=c.length;h<d;h++)u.add(c[h]);if(r.name&&(u.userData.name=r.name,u.name=a),zn(u,r),r.extensions&&es(n,u,r),r.matrix!==void 0){let h=new Le;h.fromArray(r.matrix),u.applyMatrix4(h)}else r.translation!==void 0&&u.position.fromArray(r.translation),r.rotation!==void 0&&u.quaternion.fromArray(r.rotation),r.scale!==void 0&&u.scale.fromArray(r.scale);if(!s.associations.has(u))s.associations.set(u,{});else if(r.mesh!==void 0&&s.meshCache.refs[r.mesh]>1){let h=s.associations.get(u);s.associations.set(u,{...h})}return s.associations.get(u).nodes=e,u}),this.nodeCache[e]}loadScene(e){let t=this.extensions,n=this.json.scenes[e],s=this,r=new pt;n.name&&(r.name=s.createUniqueName(n.name)),zn(r,n),n.extensions&&es(t,r,n);let a=n.nodes||[],o=[];for(let l=0,c=a.length;l<c;l++)o.push(s.getDependency("node",a[l]));return Promise.all(o).then(function(l){for(let u=0,h=l.length;u<h;u++){let d=l[u];d.parent!==null?r.add(Wd(d)):r.add(d)}let c=u=>{let h=new Map;for(let[d,f]of s.associations)(d instanceof sn||d instanceof Dt)&&h.set(d,f);return u.traverse(d=>{let f=s.associations.get(d);f!=null&&h.set(d,f)}),h};return s.associations=c(r),r})}_createAnimationTracks(e,t,n,s,r){let a=[],o=e.name?e.name:e.uuid,l=[];function c(f){f.morphTargetInfluences&&l.push(f.name?f.name:f.uuid)}Ai[r.path]===Ai.weights?(c(e),e.isGroup&&e.children.forEach(c)):l.push(o);let u;switch(Ai[r.path]){case Ai.weights:u=ni;break;case Ai.rotation:u=ii;break;case Ai.translation:case Ai.scale:u=bi;break;default:n.itemSize===1?u=ni:u=bi;break}let h=s.interpolation!==void 0?ry[s.interpolation]:Fi,d=this._getArrayFromAccessor(n);for(let f=0,g=l.length;f<g;f++){let _=new u(l[f]+"."+Ai[r.path],t.array,d,h);s.interpolation==="CUBICSPLINE"&&this._createCubicSplineTrackInterpolant(_),a.push(_)}return a}_getArrayFromAccessor(e){let t=e.array;if(e.normalized){let n=mu(t.constructor),s=new Float32Array(t.length);for(let r=0,a=t.length;r<a;r++)s[r]=t[r]*n;t=s}return t}_createCubicSplineTrackInterpolant(e){e.createInterpolant=function(n){let s=this instanceof ii?fu:hl;return new s(this.times,this.values,this.getValueSize()/3,n)},e.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}};function dy(i,e,t){let n=e.attributes,s=new Ht;if(n.POSITION!==void 0){let o=t.json.accessors[n.POSITION],l=o.min,c=o.max;if(l!==void 0&&c!==void 0){if(s.set(new D(l[0],l[1],l[2]),new D(c[0],c[1],c[2])),o.normalized){let u=mu(Js[o.componentType]);s.min.multiplyScalar(u),s.max.multiplyScalar(u)}}else{console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");return}}else return;let r=e.targets;if(r!==void 0){let o=new D,l=new D;for(let c=0,u=r.length;c<u;c++){let h=r[c];if(h.POSITION!==void 0){let d=t.json.accessors[h.POSITION],f=d.min,g=d.max;if(f!==void 0&&g!==void 0){if(l.setX(Math.max(Math.abs(f[0]),Math.abs(g[0]))),l.setY(Math.max(Math.abs(f[1]),Math.abs(g[1]))),l.setZ(Math.max(Math.abs(f[2]),Math.abs(g[2]))),d.normalized){let _=mu(Js[d.componentType]);l.multiplyScalar(_)}o.max(l)}else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")}}s.expandByVector(o)}i.boundingBox=s;let a=new nn;s.getCenter(a.center),a.radius=s.min.distanceTo(s.max)/2,i.boundingSphere=a}function Zd(i,e,t){let n=e.attributes,s=[];function r(a,o){return t.getDependency("accessor",a).then(function(l){i.setAttribute(o,l)})}for(let a in n){let o=pu[a]||a.toLowerCase();o in i.attributes||s.push(r(n[a],o))}if(e.indices!==void 0&&!i.index){let a=t.getDependency("accessor",e.indices).then(function(o){i.setIndex(o)});s.push(a)}return Ve.workingColorSpace!==Yt&&"COLOR_0"in n&&console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${Ve.workingColorSpace}" not supported.`),zn(i,e),dy(i,e,t),Promise.all(s).then(function(){return e.targets!==void 0?oy(i,e.targets,t):i})}var Jd=10,xu={};async function Qd(){let i=window.SHIP_MODELS;if(i)for(let[e,t]of Object.entries(i))try{let n=Uint8Array.from(atob(t),d=>d.charCodeAt(0)).buffer,r=(await new cl().parseAsync(n,"")).scene,a=new Ht().setFromObject(r),o=a.getSize(new D);o.z>o.x&&(r.rotation.y=Math.PI/2,a=new Ht().setFromObject(r),o=a.getSize(new D));let l=new pt;l.add(r);let c=+e*Jd*.86/o.x;l.scale.setScalar(c);let u=a.getCenter(new D),h=window.SHIP_WATERLINE??.22;r.position.set(-u.x,-a.min.y-o.y*h,-u.z),l.traverse(d=>{d.isMesh&&(d.castShadow=d.receiveShadow=!0),d.layers.enable(1)}),xu[e]=l}catch(n){console.warn(`ship model for length ${e} could not be read, using the built-in ship`,n)}}var dl=i=>(i=Math.min(Math.max(i,0),1),i*i*(3-2*i));function fy(i,e,t,n){let r=[],a=[],o=[],l=[],c=[],u=[.3,.085,.07],h=[.03,.035,.04],d=[.3,.33,.36],f=15;for(let p=0;p<=56;p++){let y=p/56,w=-i/2+y*i,M=y>.52?1-Math.pow((y-.52)/.48,1.75):1,b=.7+.3*dl(y/.22),E=Math.max(e/2*M*b,.03),x=t+1.5*Math.pow(Math.max(0,(y-.58)/.42),2),T=.1*dl((y-.55)/.4),N=2.6*dl((y-.8)/.2),C=n*.35*dl((.12-y)/.12),P=[[0,-n+C,u],[.55*E,-n+C,u],[.92*E,-n*.45+C*.5,u],[.975*E,-.08,u],[.978*E,-.03,h],[.985*E,.42,h],[.986*E,.47,d],[E*(1+T),x,d]],F=[...P.slice(1).reverse().map(([A,U,B])=>[-A,U,B]),...P];for(let[A,U,B]of F)r.push(w+N*((U+n)/(x+n)),U,A),a.push(...B);let G=w+N;if(l.push(G,x,-E*(1+T),G,x,E*(1+T)),p<56){for(let U=0;U<f-1;U++){let B=p*f+U,V=(p+1)*f+U;o.push(B,V,B+1,B+1,V,V+1)}let A=p*2;c.push(A,A+1,A+2,A+1,A+3,A+2)}}let g=r.length/3;for(let p=0;p<f;p++)r.push(r[p*3],r[p*3+1],r[p*3+2]),a.push(a[p*3],a[p*3+1],a[p*3+2]);r.push(-i/2,t*.4,0),a.push(...d);for(let p=0;p<f-1;p++)o.push(g+f,g+p+1,g+p);let _=new gt;_.setAttribute("position",new $e(r,3)),_.setAttribute("color",new $e(a,3)),_.setIndex(o),_.computeVertexNormals();let m=new gt;return m.setAttribute("position",new $e(l,3)),m.setIndex(c),m.computeVertexNormals(),[_,m]}function py(i){let e=i*Jd*.86,t=Math.min(5.4,3+i*.55),n=2.5,s=1.7,r=new pt,a=new qt({color:6450034,roughness:.58,metalness:.3}),o=new qt({vertexColors:!0,roughness:.5,metalness:.35,side:Xt,shadowSide:Mn}),l=new qt({color:4080971,roughness:.85,metalness:.1}),c=new qt({color:1843494,roughness:.45,metalness:.6}),u=new qt({color:726560,roughness:.08,metalness:.9,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),[h,d]=fy(e,t,n,s);r.add(new je(h,o),new je(d,l));let f=(C,P,F,G,A=0,U=r)=>{let B=new je(C,P);return B.position.set(F,G,A),U.add(B),B},g=(C,P,F,G,A,U=0,B=a)=>f(new dn(C,P,F),B,G,A+P/2,U),_=(C,P,F,G,A,U=0,B=a,V=18)=>f(new Jt(C,P,F,V),B,G,A+F/2,U),m=e*.02,p=e*(i>=3?.36:.3);g(p,2,t*.62,m,n),g(p*.62,1.9,t*.52,m+p*.12,n+2);let y=m+p*.3;g(p*.3,1.9,t*.6,y,n+3.9),g(p*.3+.16,.6,t*.6+.16,y,n+4.75,0,u),g(p*.34,.14,t*.92,y-.2,n+3.9),g(p*.2,1.1,t*.36,y-.4,n+5.8);for(let C=0;C<Math.round(p/1.6);C++)for(let P of[-1,1])f(new Rr(.16,10),u,m-p/2+.9+C*1.6,n+1.25,P*(t*.31+.05)).rotation.y=P>0?0:Math.PI;let w=y-.6,M=n+6.9;_(.12,.18,7.5,w,M);let b=(C,P,F)=>{let G=new D(...C),A=new D(...P),U=f(new Jt(F,F,G.distanceTo(A),10),a,0,0);U.position.copy(G).add(A).multiplyScalar(.5),U.quaternion.setFromUnitVectors(new D(0,1,0),A.clone().sub(G).normalize())};for(let C of[-1,1])b([w-1.9,M,C*.95],[w-.05,M+5.6,C*.08],.075);b([w,M+5.4,-t*.42],[w,M+5.4,t*.42],.05);let E=new pt;E.position.set(w,M+7.7,0);let x=new je(new dn(.16,.7,2.3),c);x.position.y=.6,E.add(x),r.add(E),f(new zi(.55,16,10),new qt({color:14277852,roughness:.4}),y-.2,n+7.2);let T=i>=4?[-.06,-.15]:[-.1];for(let C of T){let P=new pt;P.position.set(m+e*C,n+3.9,0),P.rotation.z=.15;let F=i>=4?1:i===3?.85:.68;P.scale.set(F,F,.72*F);let G=new je(new Jt(.95,1.15,3.6,20),a);G.position.y=1.8;let A=new je(new Jt(.97,.96,.7,20),c);A.position.y=3.6,P.add(G,A),r.add(P)}let N=(C,P,F)=>{let G=new pt;G.position.set(C,P,0),G.rotation.y=F>0?0:Math.PI;let A=new je(new Jt(1.35,1.45,.45,20),a);A.position.y=.22;let U=new je(new Jt(1.1,1.4,1.25,20),a);U.position.y=1.05,U.scale.set(1.25,1,.95),G.add(A,U);for(let B of[-.42,.42]){let V=new je(new Jt(.11,.14,4.4,10),c);V.rotation.z=-Math.PI/2+.12,V.position.set(3,1.38,B),G.add(V)}r.add(G)};return N(e*.3,n+.35,1),i>=3&&N(-e*.34,n,-1),i>=4&&(N(e*.21,n+1.5,1),g(3.4,1.2,t*.5,e*.21,n+.3)),g(.12,.7,t*.6,e*.39,n+.9),_(.03,.03,2,e*.47+2.2,n+1.4),_(.03,.03,2.4,-e*.48,n),r.traverse(C=>{C.isMesh&&(C.castShadow=C.receiveShadow=!0),C.layers.enable(1)}),r.userData.tick=C=>E.rotation.y=C*1.6,r}function $d(i){return xu[i]?xu[i].clone():py(i)}var aa=10,er=30,Qs=i=>-er+aa*(i+.5),$s=i=>-er+aa*(i+.5),ef=[[.86,.5,46,.42],[.6,.8,31,.26],[.98,-.17,23,.17],[.34,.94,17,.11],[.77,-.64,13,.07]],tf=ef.map(i=>`W(vec2(${i[0].toFixed(3)}, ${i[1].toFixed(3)}), ${i[2].toFixed(1)}, ${i[3].toFixed(3)});`).join(`
    `);function yu(i,e,t){let n=0;for(let[s,r,a,o]of ef){let l=2*Math.PI/a;n+=o*Math.sin(l*(s*i+r*e-Math.sqrt(9.81/l)*t))}return n}var my=`
  float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`,gy=`
  uniform float uTime;
  varying vec3 vWorld;
  varying vec2 vFlat;
  varying float vH;
  varying vec4 vMirror;
  uniform mat4 uMirrorVP;
  void main(){
    vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
    vFlat = p.xz;
    float h = 0.0; vec2 off = vec2(0.0);
    #define W(D, lam, a) { float k = 6.28318 / lam; float f = k * (dot(D, p.xz) - sqrt(9.81 / k) * uTime); h += a * sin(f); off += D * a * 0.6 * cos(f); }
    ${tf}
    float fade = 1.0 - smoothstep(350.0, 900.0, length(p.xz));
    p.y += h * fade; p.xz += off * fade;
    vH = h; vWorld = p;
    vMirror = uMirrorVP * vec4(vFlat.x, 0.0, vFlat.y, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`,xy=`
  precision highp float;
  ${my}
  uniform float uTime;
  uniform vec3 uSun, uSunColor;
  uniform samplerCube uEnv;
  uniform sampler2D uNormals;
  uniform sampler2D uMirror;
  uniform vec3 uHover;          // x, z of hovered cell centre, z = strength
  uniform vec4 uRipple[6];      // x, z, start time, strength
  uniform vec4 uLine;           // highlighted scan line: axis (0 row / 1 col), index, strength
  uniform vec4 uShip[3];        // x, z, half length, 1 = along x / 0 = along z
  uniform float uShipOn[3];
  uniform float uGrid;
  varying vec3 vWorld;
  varying vec2 vFlat;
  varying float vH;
  varying vec4 vMirror;

  vec2 nm(vec2 uv){ return texture2D(uNormals, uv).xy * 2.0 - 1.0; }

  void main(){
    vec3 V = normalize(cameraPosition - vWorld);
    float dist = length(cameraPosition - vWorld);
    vec2 slope = vec2(0.0);
    #define W(D, lam, a) { float k = 6.28318 / lam; float f = k * (dot(D, vFlat) - sqrt(9.81 / k) * uTime); slope += D * k * a * cos(f); }
    ${tf}
    // wind chop from a measured-looking normal map, four drifting layers at three scales
    float t = uTime;
    vec2 d1 = nm(vFlat / 9.0 + t * vec2(0.031, 0.017)) + nm(vFlat / 6.1 - t * vec2(0.022, 0.035));
    vec2 d2 = nm(vFlat / 27.0 + t * vec2(0.012, -0.008)) + nm(vFlat / 61.0 - t * vec2(0.006, 0.004));
    float near = clamp(140.0 / dist, 0.0, 1.0);
    slope += d1 * 0.20 * near + d2 * mix(0.30, 0.16, near);
    // splash rings
    float ring = 0.0;
    for (int i = 0; i < 6; i++){
      float age = uTime - uRipple[i].z;
      if (age > 0.0 && age < 6.0){
        vec2 d = vFlat - uRipple[i].xy; float r = length(d) + 1e-3;
        float wv = sin(1.6 * r - 9.0 * age) * exp(-0.5 * age) * smoothstep(9.0 * age + 2.0, 9.0 * age - 4.0, r) * uRipple[i].w;
        slope += (d / r) * wv * 0.22; ring += abs(wv) * smoothstep(3.0, 0.0, age);
      }
    }
    // hulls: contact shadow, and foam where the water meets the plating
    float shade = 0.0, hullFoam = 0.0;
    for (int i = 0; i < 3; i++){
      vec2 q = vFlat - uShip[i].xy;
      q = uShip[i].w > 0.5 ? q : q.yx;
      float sd = length(vec2(max(abs(q.x) - uShip[i].z + 2.0, 0.0), q.y)) - 2.1;
      hullFoam += uShipOn[i] * smoothstep(1.6, 0.0, abs(sd - 0.3)) * (0.45 + 0.55 * vnoise(vFlat * 1.3 + t * 0.6));
      vec2 qs = vFlat - uShip[i].xy + uSun.xz * 7.0;
      qs = uShip[i].w > 0.5 ? qs : qs.yx;
      float ss = length(vec2(max(abs(qs.x) - uShip[i].z, 0.0), qs.y));
      shade += uShipOn[i] * smoothstep(9.0, 1.0, ss);
    }
    shade = clamp(shade, 0.0, 1.0);

    vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
    float nv = max(dot(N, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
    vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.015; R = normalize(R);
    vec3 refl = min(textureCube(uEnv, R).rgb, vec3(2.2));
    vec2 muv = vMirror.xy / vMirror.w * 0.5 + 0.5 + N.xz * 0.04;
    vec4 mir = texture2D(uMirror, muv);
    refl = mix(refl, mir.rgb, mir.a * 0.92);
    // sun glitter
    vec3 Hh = normalize(V + uSun);
    float spec = min(pow(max(dot(N, Hh), 0.0), 520.0) * 14.0, 6.0) + pow(max(dot(N, Hh), 0.0), 60.0) * 0.2;
    refl += uSunColor * spec * (1.0 - shade);
    // water body: deep absorption plus light scattered back through the crests
    vec3 deep = vec3(0.004, 0.030, 0.050);
    vec3 scatter = vec3(0.012, 0.115, 0.125);
    float crest = clamp(vH * 0.8 + 0.45 + dot(d1, uSun.xz) * 0.25, 0.0, 1.0);
    float back = pow(max(dot(V, -uSun), 0.0), 4.0);
    vec3 body = deep + scatter * crest * (0.55 + 1.6 * back) * (1.0 - 0.5 * shade);
    vec3 col = mix(body, refl, F);
    col *= 1.0 - 0.35 * shade;
    float foam = clamp(hullFoam * 0.28 + ring * 0.6, 0.0, 0.9);
    col = mix(col, vec3(0.80, 0.84, 0.86) * (0.55 + 0.6 * max(uSun.y * 2.0, 0.3)), foam);
    // the grid, painted on the surface
    vec2 g = (vFlat + 30.0) / 10.0;
    float inside = step(0.0, g.x) * step(g.x, 6.0) * step(0.0, g.y) * step(g.y, 6.0);
    vec2 fw = fwidth(g) * 1.2 + 0.012;
    vec2 gl = smoothstep(fw, vec2(0.0), abs(fract(g + 0.5) - 0.5));
    float line = max(gl.x, gl.y) * inside;
    float border = max(smoothstep(fw.x * 2.0, 0.0, abs(g.x)) + smoothstep(fw.x * 2.0, 0.0, abs(g.x - 6.0)), smoothstep(fw.y * 2.0, 0.0, abs(g.y)) + smoothstep(fw.y * 2.0, 0.0, abs(g.y - 6.0)));
    border *= step(-0.05, g.x) * step(g.x, 6.05) * step(-0.05, g.y) * step(g.y, 6.05);
    col = mix(col, vec3(0.9), uGrid * clamp(line * 0.2 + border * 0.45, 0.0, 0.65));
    vec2 hd = abs(vFlat - uHover.xy);
    col += uHover.z * 0.10 * step(max(hd.x, hd.y), 5.0);
    float lc = uLine.x < 0.5 ? g.y : g.x;
    col += uLine.z * 0.09 * inside * step(uLine.y, lc) * step(lc, uLine.y + 1.0);
    // aerial perspective toward the horizon colour of the real sky
    vec3 hz = min(textureCube(uEnv, normalize(vec3(-V.x, 0.03, -V.z))).rgb, vec3(1.6));
    col = mix(col, hz, 1.0 - exp(-dist * 0.00055));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`,yy=`
  precision highp float;
  precision highp sampler3D;
  uniform sampler2D uBelief;    // r = density, g = probability of a ship
  uniform sampler3D uNoise;
  uniform float uTime, uAmount, uSteps;
  uniform vec3 uSun, uSunColor, uAmbient;
  varying vec3 vWorld;
  const float TOP = 12.0;
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  vec2 belief(vec2 xz){
    vec2 uv = (xz + 30.0) / 60.0;
    vec2 e = smoothstep(vec2(-0.07), vec2(0.04), uv) * smoothstep(vec2(1.07), vec2(0.96), uv);
    vec4 b = texture2D(uBelief, clamp(uv, 0.02, 0.98));
    return vec2(b.r * e.x * e.y, b.g);
  }
  float density(vec3 p, float detail){
    vec2 b = belief(p.xz);
    if (b.x < 0.015) return 0.0;
    float h = p.y / TOP;
    float prof = smoothstep(0.0, 0.07, h) * smoothstep(1.0, 0.18, h);
    vec3 q = p * 0.021 + vec3(uTime * 0.006, uTime * 0.002, uTime * 0.004);
    float n = texture(uNoise, q).r;
    if (detail > 0.5) n = n * 0.72 + texture(uNoise, q * 3.3 + 0.37).r * 0.2 + texture(uNoise, q * 8.1 + 0.11).r * 0.08;
    float cover = mix(0.60, 0.27, b.x) + h * 0.22;
    return clamp((n - cover) * 4.2, 0.0, 1.0) * prof * b.x;
  }
  void main(){
    vec3 ro = cameraPosition, rd = normalize(vWorld - cameraPosition);
    vec3 lo = vec3(-37.0, 0.0, -37.0), hi = vec3(37.0, TOP, 37.0);
    vec3 t0 = (lo - ro) / rd, t1 = (hi - ro) / rd;
    vec3 tn = min(t0, t1), tf = max(t0, t1);
    float ta = max(max(tn.x, tn.y), max(tn.z, 0.0)), tb = min(min(tf.x, tf.y), tf.z);
    if (tb <= ta) discard;
    const int STEPS = 44;
    float dt = (tb - ta) / uSteps;
    float t = ta + dt * ign(gl_FragCoord.xy + fract(uTime * 7.0) * 13.0);
    float cosT = dot(rd, uSun);
    float g = 0.55;
    float phase = mix(0.9, (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5), 0.55);
    float trans = 1.0; vec3 acc = vec3(0.0);
    for (int i = 0; i < STEPS; i++){
      if (float(i) >= uSteps) break;
      vec3 p = ro + rd * t;
      float den = density(p, 1.0) * uAmount;
      if (den > 0.002){
        float od = 0.0;
        for (int j = 1; j <= 3; j++) od += density(p + uSun * (float(j) * 2.2), 0.0);
        float sunT = exp(-od * 1.9);
        float powder = 1.0 - exp(-den * 7.0);
        float h = p.y / TOP;
        vec3 light = uSunColor * sunT * phase * mix(0.6, 1.0, powder) + uAmbient * (0.45 + 0.55 * h);
        float pr = belief(p.xz).y;
        vec3 alb = mix(vec3(1.0), vec3(1.0, 0.50, 0.20), smoothstep(0.30, 0.85, pr) * 0.85);
        vec3 c = light * alb + vec3(1.0, 0.38, 0.10) * smoothstep(0.45, 0.95, pr) * 0.55 * (1.0 - h);
        float a = 1.0 - exp(-den * dt * 0.62);
        acc += trans * a * c; trans *= 1.0 - a;
      }
      t += dt;
      if (trans < 0.015) break;
    }
    gl_FragColor = vec4(acc, 1.0 - trans);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`,vy=`
  varying vec3 vWorld;
  void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`,_y={uniforms:{tDiffuse:{value:null},uTime:{value:0}},vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:`
    uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 d = vUv - 0.5;
      c *= 1.0 - 0.38 * dot(d, d) * 1.6;
      c += (h(vUv * 911.0 + fract(uTime)) - 0.5) * 0.018;
      gl_FragColor = vec4(c, 1.0);
    }`},vu=null;function Sy(){if(vu)return vu;let i=48,e=new Uint8Array(i*i*i),t=7,n=()=>(t=t*1664525+1013904223>>>0)/4294967296,s=c=>{let u=new Float32Array(c*c*c).map(n),h=(f,g,_)=>u[(f%c*c+g%c)*c+_%c],d=f=>f*f*(3-2*f);return(f,g,_)=>{let m=f*c,p=g*c,y=_*c,w=Math.floor(m),M=Math.floor(p),b=Math.floor(y),E=d(m-w),x=d(p-M),T=d(y-b),N=(C,P,F)=>C+(P-C)*F;return N(N(N(h(w,M,b),h(w+1,M,b),E),N(h(w,M+1,b),h(w+1,M+1,b),E),x),N(N(h(w,M,b+1),h(w+1,M,b+1),E),N(h(w,M+1,b+1),h(w+1,M+1,b+1),E),x),T)}},r=[s(3),s(6),s(12),s(24)],a=[.5,.27,.15,.08],o=0;for(let c=0;c<i;c++)for(let u=0;u<i;u++)for(let h=0;h<i;h++){let d=0;for(let f=0;f<4;f++)d+=a[f]*r[f](h/i,u/i,c/i);e[o++]=Math.max(0,Math.min(255,Math.round(d*255)))}let l=new ws(e,i,i,i);return l.format=Hs,l.minFilter=l.magFilter=ut,l.wrapS=l.wrapT=l.wrapR=Rn,l.unpackAlignment=1,l.needsUpdate=!0,vu=l}var fl=class{constructor(e,{interactive:t=!1}={}){this.host=e,this.interactive=t,this.onAction=null,this.locked=!1,e.classList.add("sea");let n=new nl({antialias:!1,powerPreference:"high-performance"});n.toneMapping=Ki,n.toneMappingExposure=.5,n.shadowMap.enabled=!0,n.shadowMap.type=Wi,n.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5)),this.renderer=n,e.appendChild(n.domElement),this.labels=document.createElement("div"),this.labels.className="sea-labels",e.appendChild(this.labels),this.scene=new Rs,this.camera=new Tt(46,1,12,9e3),this.mirrorCam=new Tt(46,1,12,9e3),this.mirrorCam.layers.set(1),this.mirrorRT=new mt(1024,1024,{type:_t}),this.sun=new D(-.66,.2,-.74).normalize(),this.sunColor=new Te(1,.78,.55).multiplyScalar(3.2),this.time={value:0};let s=()=>{let m=new na;m.scale.setScalar(5e3);let p=m.material.uniforms;return p.turbidity.value=3.2,p.rayleigh.value=1.35,p.mieCoefficient.value=.0025,p.mieDirectionalG.value=.8,p.sunPosition.value.copy(this.sun),p.showSunDisc&&(p.showSunDisc.value=0),p.cloudCoverage&&(p.cloudCoverage.value=.46,p.cloudDensity.value=.42,p.cloudElevation.value=.42),m};this.sky=s(),this.scene.add(this.sky);let r=new Rs;r.add(s());let a=new $i(256,{type:_t,generateMipmaps:!0,minFilter:an});new Ti(1,8e3,a).update(n,r);let l=new Xs(n);this.scene.environment=l.fromScene(r,0,1,8e3).texture,this.scene.environmentIntensity=.55,l.dispose();let c=new Hi(16769728,1.7);c.position.copy(this.sun).multiplyScalar(160),c.castShadow=!0,c.shadow.mapSize.set(2048,2048),Object.assign(c.shadow.camera,{left:-55,right:55,top:55,bottom:-55,near:20,far:320}),c.shadow.bias=-.0015,c.shadow.normalBias=.3,c.layers.enable(1),this.scene.add(c);let u=new Gi().load(Hd);u.wrapS=u.wrapT=Rn,u.anisotropy=8,this.ripples=Array.from({length:6},()=>new Ye(0,0,-100,0)),this.rippleIx=0,this.waterU={uTime:this.time,uSun:{value:this.sun},uSunColor:{value:this.sunColor},uEnv:{value:a.texture},uNormals:{value:u},uShip:{value:[0,1,2].map(()=>new Ye(0,0,10,1))},uShipOn:{value:[0,0,0]},uMirror:{value:this.mirrorRT.texture},uMirrorVP:{value:new Le},uHover:{value:new D(0,0,0)},uRipple:{value:this.ripples},uLine:{value:new Ye(0,0,0,0)},uGrid:{value:1}};let h=new ki(2400,2400,320,320);h.rotateX(-Math.PI/2);let d=h.attributes.position;for(let m=0;m<d.count;m++){let p=d.getX(m)/1200,y=d.getZ(m)/1200,w=Math.max(Math.abs(p),Math.abs(y)),M=w>0?Math.pow(w,2.6)/w:0;d.setX(m,p*M*1200+(w>.999?p*3e3:0)),d.setZ(m,y*M*1200+(w>.999?y*3e3:0))}let f=new je(h,new dt({vertexShader:gy,fragmentShader:xy,uniforms:this.waterU}));f.frustumCulled=!1,this.scene.add(f),this.cur=new Float32Array(72),this.target=new Float32Array(72),this.beliefData=new Uint8Array(144),this.beliefTex=new Si(this.beliefData,6,6,ln),this.beliefTex.magFilter=ut,this.beliefTex.minFilter=ut,this.fogU={uBelief:{value:this.beliefTex},uTime:this.time,uAmount:{value:1},uSun:{value:this.sun},uSunColor:{value:this.sunColor.clone().multiplyScalar(.62)},uAmbient:{value:new Te(.52,.62,.76).multiplyScalar(.95)},uNoise:{value:Sy()},uSteps:{value:44}},this.fogAmountTarget=1;let g=new je(new dn(74,12,74),new dt({vertexShader:vy,fragmentShader:yy,uniforms:this.fogU,side:Rt,transparent:!0,depthWrite:!1,depthTest:!1,blending:uo,blendSrc:ho,blendDst:Vr}));g.position.y=6,g.renderOrder=5,this.scene.add(g),this.ships=new pt,this.markers=new pt,this.scene.add(this.ships,this.markers),this.floaters=[],this.shots=new Map,this.scanResults=Array.from({length:12},()=>[]),this.anim=[],this.hover=null,this.hoverLine=null,this.orbit=0,this.revealed=!1,this.composer=new al(n,new mt(4,4,{type:_t,samples:4})),this.composer.addPass(new ol(this.scene,this.camera)),this.bloom=new Ys(new Ee(4,4),.1,.5,3),this.composer.addPass(this.bloom),this.composer.addPass(new ll),this.grade=new Zs(_y),this.composer.addPass(this.grade),this._buildLabels(),this._bindPointer(),this._resize(),new ResizeObserver(()=>this._resize()).observe(e),this.visible=!1,new IntersectionObserver(m=>{this.visible=m[0].isIntersecting},{threshold:.01}).observe(e),this.clock=new Br;let _=()=>{requestAnimationFrame(_),this.visible&&this._frame()};_()}setBelief(e,t=!1){for(let n=0;n<36;n++){let s=Math.min(Math.max(e[n],1e-6),.999999),r=-(s*Math.log2(s)+(1-s)*Math.log2(1-s));this.target[n*2]=Math.max(r,.8*s),this.target[n*2+1]=s}t&&this.cur.set(this.target)}reset(){for(let e of[this.ships,this.markers])for(;e.children.length;)e.remove(e.children[0]);this.floaters=[],this.shots.clear(),this.scanResults.forEach(e=>e.length=0),this.anim=[],this.revealed=!1,this.fogAmountTarget=1,this.waterU.uGrid.value=1,this.orbitTarget=0,this.waterU.uShipOn.value=[0,0,0],this._renderScanLabels(),this.host.classList.remove("revealed")}showFire(e,t){let n=Math.floor(e/6),s=e%6,r=this.shots.get(e)||0;this.shots.set(e,r+1);let a=Qs(s)+(r?r%2?2.4:-2.4:0),o=$s(n)+(r>1?2.4:0);this._ripple(a,o,1);let l=t?16734751:16054523,c=new pt,u=new je(new Jt(.55,.75,1.5,16),new qt({color:t?12728850:14673642,roughness:.5}));u.position.y=.5;let h=new je(new zi(t?.62:.42,16,12),new Wt({color:l}));h.position.y=1.7;let d=new je(new Jt(.06,t?.7:.4,t?9:5,16,1,!0),new Wt({color:l,transparent:!0,opacity:t?.5:.3,blending:qi,depthWrite:!1,side:Xt}));d.position.y=t?6.2:4.2,c.add(u,h,d),c.traverse(g=>{g.layers.enable(1),g.renderOrder=8}),c.position.set(a,0,o),c.scale.setScalar(.01),this.markers.add(c),this.floaters.push({obj:c,x:a,z:o,tilt:.35}),this._tween(.5,g=>c.scale.setScalar(Math.max(.01,by(g))));let f=new je(new Cr(1.4,9,12,1,!0),new Wt({color:16777215,transparent:!0,opacity:.7,depthWrite:!1}));f.position.set(a,0,o),f.renderOrder=7,this.markers.add(f),this._tween(.9,g=>{f.scale.set(1+g*.8,Math.sin(g*Math.PI)*1.2+.01,1+g*.8),f.position.y=4.5*f.scale.y,f.material.opacity=.7*(1-g)},()=>this.markers.remove(f))}showScan(e,t){this.scanResults[e].push(t),this._renderScanLabels();let n=e<6,s=e%6;this.waterU.uLine.value.set(n?0:1,s,1,0),this._tween(1.4,r=>this.waterU.uLine.value.z=1-r);for(let r=0;r<6;r++){let a=Qs(n?r:s),o=$s(n?s:r);setTimeout(()=>this._ripple(a,o,.35),r*70)}}reveal(e){this.revealed||(this.revealed=!0,this.fogAmountTarget=0,this.orbitTarget=1,this.host.classList.add("revealed"),e.forEach((t,n)=>{let s=$d(t.length),r=t.cells,a=r.reduce((u,h)=>u+Qs(h[1]),0)/r.length,o=r.reduce((u,h)=>u+$s(h[0]),0)/r.length;s.rotation.y=t.horiz?0:Math.PI/2;let l=new pt;l.add(s),l.position.set(a,-11,o),this.ships.add(l);let c={obj:l,x:a,z:o,tilt:.1,lift:-11};this.floaters.push(c),this.waterU.uShip.value[n].set(a,o,t.length*aa*.43,t.horiz?1:0),setTimeout(()=>{this._ripple(a,o,.8),this._tween(2.4,u=>{c.lift=-11*(1-My(u)),this.waterU.uShipOn.value[n]=u*u})},500+n*350)}))}_tween(e,t,n){this.anim.push({t:0,dur:e,fn:t,done:n})}_ripple(e,t,n){this.ripples[this.rippleIx].set(e,t,this.time.value,n),this.rippleIx=(this.rippleIx+1)%this.ripples.length}_buildLabels(){this.scanBtns=[];for(let e=0;e<12;e++){let t=document.createElement("button");t.className="scan-btn",t.type="button";let n=e<6;t.setAttribute("aria-label",`Scan ${n?"row":"column"} ${e%6+1}`),t.innerHTML=`<span class="scan-ico">${n?"&rarr;":"&darr;"}</span><span class="scan-res"></span>`,t.addEventListener("click",()=>{this.interactive&&!this.locked&&this.onAction&&this.onAction(36+e)}),t.addEventListener("pointerenter",()=>this.hoverLine=e),t.addEventListener("pointerleave",()=>this.hoverLine=null),this.labels.appendChild(t);let s=n?new D(-er-5.5,.5,$s(e)):new D(Qs(e-6),.5,-er-5.5);this.scanBtns.push({el:t,p:s})}}_renderScanLabels(){this.scanBtns.forEach(({el:e},t)=>{let n=this.scanResults[t];e.querySelector(".scan-res").textContent=n.join(" \xB7 "),e.classList.toggle("has-res",n.length>0)})}_bindPointer(){let e=this.renderer.domElement,t=new Fr,n=new tn(new D(0,1,0),0),s=r=>{let a=e.getBoundingClientRect(),o=new Ee((r.clientX-a.left)/a.width*2-1,-((r.clientY-a.top)/a.height)*2+1);t.setFromCamera(o,this.camera);let l=new D;if(!t.ray.intersectPlane(n,l))return null;let c=Math.floor((l.x+er)/aa),u=Math.floor((l.z+er)/aa);return c>=0&&c<6&&u>=0&&u<6?u*6+c:null};e.addEventListener("pointermove",r=>{this.hover=this.interactive&&!this.locked?s(r):null,e.style.cursor=this.hover!==null?"crosshair":"default"}),e.addEventListener("pointerleave",()=>this.hover=null),e.addEventListener("click",r=>{if(!this.interactive||this.locked||!this.onAction)return;let a=s(r);a!==null&&this.onAction(a)})}_resize(){let e=this.host.clientWidth||1,t=this.host.clientHeight||1;this.renderer.setSize(e,t,!1),this.composer.setPixelRatio(this.renderer.getPixelRatio()),this.composer.setSize(e,t),this.camera.aspect=e/t,this.camera.updateProjectionMatrix(),this.size=[e,t]}_frame(){let e=this.clock.getDelta(),t=Math.min(e,.05)*(window.__seaSpeed||1);this.ft=(this.ft??.016)*.95+Math.min(e,.2)*.05,(this.fq=(this.fq||0)+1)>45&&this.ft>.03&&!window.__seaFixedQuality&&(this.fq=0,this.fogU.uSteps.value>22?this.fogU.uSteps.value-=11:this.renderer.getPixelRatio()>.7&&(this.renderer.setPixelRatio(this.renderer.getPixelRatio()*.8),this._resize()));let n=this.time.value+=t;this.orbit+=((this.orbitTarget||0)-this.orbit)*Math.min(1,t*.8);let s=this.camera.aspect,r=116/Math.min(s/1.18,1.2)*(1-.06*this.orbit),a=Ji.degToRad(25-9*this.orbit),o=Ji.degToRad(21-7*this.orbit),l=Math.sin(n*.05)*.06+.42*this.orbit,c=Math.sin(l)*Math.cos(a)*r,u=Math.sin(a)*r,h=Math.cos(l)*Math.cos(a)*r,d=u/Math.tan(o)/Math.hypot(c,h);this.look=[c*(1-d),0,h*(1-d)],this.camera.position.set(c,u,h),this.camera.lookAt(this.look[0],0,this.look[2]),window.__seaCam&&(this.camera.position.set(...window.__seaCam.slice(0,3)),this.look=[window.__seaCam[3],0,window.__seaCam[5]],this.camera.lookAt(...window.__seaCam.slice(3)));for(let b of this.anim)b.t+=t,b.fn(Math.min(b.t/b.dur,1)),b.t>=b.dur&&b.done&&b.done();this.anim=this.anim.filter(b=>b.t<b.dur);for(let b of this.floaters){let E=yu(b.x,b.z,n),x=yu(b.x+2,b.z,n)-E,T=yu(b.x,b.z+2,n)-E;b.obj.position.y=E*.85+(b.lift||0),b.obj.children[0]?.userData.tick?.(n),b.obj.rotation.z=x*b.tilt,b.obj.rotation.x=-T*b.tilt}let f=Math.min(1,t*2.2);for(let b=0;b<72;b++)this.cur[b]+=(this.target[b]-this.cur[b])*f;for(let b=0;b<36;b++)this.beliefData[b*4]=Math.round(this.cur[b*2]*255),this.beliefData[b*4+1]=Math.round(this.cur[b*2+1]*255),this.beliefData[b*4+3]=255;this.beliefTex.needsUpdate=!0,this.fogU.uAmount.value+=(this.fogAmountTarget-this.fogU.uAmount.value)*Math.min(1,t*1.1),this.waterU.uGrid.value+=((this.revealed?.3:1)-this.waterU.uGrid.value)*f;let g=this.waterU.uHover.value;this.hover!==null?g.set(Qs(this.hover%6),$s(Math.floor(this.hover/6)),1):g.z=0,this.hoverLine!==null&&this.interactive&&!this.locked&&this.waterU.uLine.value.z<.5?this.waterU.uLine.value.set(this.hoverLine<6?0:1,this.hoverLine%6,.45,0):this.hoverLine===null&&this.waterU.uLine.value.z===.45&&(this.waterU.uLine.value.z=0);let _=this.camera,m=this.mirrorCam,p=this.renderer;m.fov=_.fov,m.aspect=_.aspect,m.updateProjectionMatrix(),m.position.set(_.position.x,-_.position.y,_.position.z),m.up.set(0,-1,0),m.lookAt(this.look[0],0,this.look[2]),m.updateMatrixWorld(),this.waterU.uMirrorVP.value.multiplyMatrices(m.projectionMatrix,m.matrixWorldInverse),p.clippingPlanes=[new tn(new D(0,1,0),.2)],p.setRenderTarget(this.mirrorRT),p.setClearColor(0,0),p.clear(),p.render(this.scene,m),p.setRenderTarget(null),p.clippingPlanes=[],this.sky.material.uniforms.time&&(this.sky.material.uniforms.time.value=n),this.grade.uniforms.uTime.value=n,this.composer.render();let[y,w]=this.size,M=this.interactive||this.scanResults.some(b=>b.length);for(let[b,{el:E,p:x}]of this.scanBtns.entries()){let T=x.clone().project(_);E.style.transform=`translate(-50%, -50%) translate(${(T.x+1)/2*y}px, ${(1-T.y)/2*w}px)`;let N=M&&!this.revealed&&(this.interactive||this.scanResults[b].length);E.style.opacity=N?1:0,E.style.pointerEvents=N&&this.interactive&&!this.locked?"auto":"none"}}},My=i=>1-Math.pow(1-i,3),by=i=>1+2.7*Math.pow(i-1,3)+1.7*Math.pow(i-1,2);var xt=window.DEMO_DATA,ke=(i,e=document)=>e.querySelector(i),ui=(i,e=document)=>[...e.querySelectorAll(i)],nf=i=>new Promise(e=>setTimeout(e,i)),ts=(i,e=2)=>(i<0?"\u2212":"")+Math.abs(i).toFixed(e),_u=i=>(i>=0?"+":"\u2212")+Math.abs(i).toFixed(2),oa={any:"Any layout",no_touch:"No touching",parallel:"All parallel",border:"On the border",center_clear:"Centre clear",clustered:"Clustered"},Ty={any:"No constraint at all.",no_touch:"No two ships touch, not even at a corner.",parallel:"All three ships point the same way.",border:"Every ship has a cell on the outer edge.",center_clear:"No ship covers the four centre cells.",clustered:"Every ship touches another ship."};var wy=i=>String.fromCharCode(65+i%6)+(Math.floor(i/6)+1),Ey=(i,e)=>{if(i<36)return`Shot ${wy(i)}: <b>${e?"hit":"miss"}</b>`;let t=i-36;return`Scan ${t<6?"row "+(t+1):"column "+String.fromCharCode(65+t-6)}: <b>${e}</b>`};function Ay(){let i=ke("#intro"),e=ui(".card",i),t=ke("#intro-progress"),n=ke("#intro-gate"),s=ke("#intro-audio"),r=e.map((m,p)=>e.slice(0,p).reduce((y,w)=>y+ +w.dataset.ms,0)),a=e.reduce((m,p)=>m+ +p.dataset.ms,0),o=-1,l=null,c=null,u=null,h=()=>{clearInterval(u),u=setInterval(()=>{s.volume=Math.max(0,s.volume-.08),s.volume<=0&&(clearInterval(u),s.pause())},30)},d=(m=!1)=>{clearTimeout(l),cancelAnimationFrame(c),i.classList.add("done"),document.body.classList.remove("intro-on"),ui("video",i).forEach(p=>p.pause()),m||h()},f=(m,p=!1)=>{if(clearTimeout(l),m>=e.length)return d(!p);o=m,e.forEach((E,x)=>E.classList.toggle("on",x===m));let y=ke("video",e[m]);y&&(y.currentTime=0,y.play().catch(()=>{})),p&&(s.currentTime=r[m]/1e3);let w=performance.now(),M=+e[m].dataset.ms,b=()=>{t.style.width=`${Math.min(100,(r[m]+performance.now()-w)/a*100)}%`,c=requestAnimationFrame(b)};cancelAnimationFrame(c),b(),l=setTimeout(()=>f(m+1),M)},g=()=>{n.classList.add("off"),clearInterval(u),s.volume=1,s.currentTime=0,s.play().catch(()=>{}),f(0)},_=m=>{i.classList.remove("done"),document.body.classList.add("intro-on"),window.scrollTo(0,0),e.forEach(p=>p.classList.remove("on")),t.style.width="0",m?n.classList.remove("off"):g()};ke("#intro-start").addEventListener("click",m=>{m.stopPropagation(),g()}),i.addEventListener("click",m=>{m.target.closest("button")||!n.classList.contains("off")||f(o+1,!0)}),ke("#intro-skip").addEventListener("click",()=>d()),ke("#intro-mute").addEventListener("click",m=>{s.muted=!s.muted,m.target.textContent=s.muted?"Sound off":"Sound on",m.target.setAttribute("aria-pressed",s.muted)}),document.addEventListener("keydown",m=>{if(!i.classList.contains("done")){if(m.key==="Escape")return d();m.key!==" "&&m.key!=="ArrowRight"&&m.key!=="Enter"||(m.preventDefault(),n.classList.contains("off")?f(o+1,!0):g())}}),ke("#replay-intro").addEventListener("click",()=>_(!1)),location.hash&&location.hash!=="#top"?(n.classList.add("off"),d()):_(!0)}function Ry(){let e=xt.calibration.policies.noise_ignoring_coder.inference,t=[...xt.headline,{value:ts(e),versus:null,text:"Lost by an agent that takes noisy reports as exact.",source:`results/battleship_calibration.json, ${xt.calibration.seeds} paired boards`}];ke("#facts").innerHTML=t.map(n=>`<div class="fact reveal" title="Source: ${n.source}"><b>${n.value}${n.versus!==null&&n.versus!==void 0?`<small>vs ${n.versus}</small>`:""}</b><p>${n.short||n.text}</p></div>`).join("")}function Cy(){let i=[["Wet lab","Rulebound Battleship"],["Hidden reaction mechanism","Hidden placement rule (6, uniform prior)"],["Rate constants",`Exact ship positions (${xt.constants.L.toLocaleString("en-US")} layouts)`],["Running an assay","A shot (cost 1) or a scan (cost 2)"],["Assay noise","Flipped reports and off-by-one counts"],["Limited stock of reagents",`Budget of ${xt.constants.budget}`],["Posterior over mechanisms","Probability per rule and per cell"]];ke("#map").innerHTML=i.map((c,u)=>c.map(h=>`<div class="${u?"":"h"}">${h}</div>`).join("")).join("");let e=xt.wetlab,t=e.action;ke("#wet-caption").textContent=`Product over ${e.mechanisms[0].t.at(-1)} minutes, 14 simulated vessels each, same run design.`;let n=Math.max(...e.mechanisms.flatMap(c=>c.P.flat())),s=200,r=130;ke("#curves").innerHTML=e.mechanisms.map(c=>{let u=c.t.at(-1),h=c.P.map(d=>`<polyline fill="none" stroke="#0b0c0e" stroke-opacity="0.38" stroke-width="1" points="${d.map((f,g)=>`${(c.t[g]/u*s).toFixed(1)},${(r-f/n*(r-6)).toFixed(1)}`).join(" ")}"/>`).join("");return`<div class="curve"><h4>${c.name.replace("_"," ")}</h4><svg viewBox="0 0 ${s} ${r}" role="img" aria-label="Product over time, ${c.name}"><line x1="0" y1="${r}" x2="${s}" y2="${r}" stroke="#0b0c0e" stroke-opacity="0.3"/>${h}</svg></div>`}).join("");let a=xt.llm.transfer,o=a?a.arms:[{name:"Base model"},{name:"Control"},{name:"RL on Battleship"}],l=a?Math.max(...o.map(c=>c.hi??c.mean)):1;ke("#transfer").innerHTML=o.map((c,u)=>a?`<div class="bar real ${u===o.length-1?"hi":""}"><em>${c.mean.toFixed(2)}</em><i style="height:${c.mean/l*82}%"></i><span>${c.name}</span></div>`:`<div class="bar"><em>not yet measured</em><i style="height:46%"></i><span>${c.name}</span></div>`).join(""),ke("#transfer-note").innerHTML=a?`Mean design reward on ${a.rows} wet-lab rows.`:"<b>Not yet run.</b> The bars stay empty until it is.",ke("#foot-note").textContent=xt.llm.base?"":"The agent shown is a labelled proxy until model runs land."}var pl=class{constructor(e,t){this.el=e,this.sea=new fl(ke(".sea-host",e),{interactive:t}),this.foot=ke(".panel-foot",e),this.log=[]}header(e,t="",n=!1){ke(".who",this.el).textContent=e;let s=ke(".tag",this.el);s.textContent=t,s.classList.toggle("pending",n)}budget(e){ke(".budget i",this.el).style.setProperty("--left",e/en),ke(".budget b",this.el).textContent=`${e} left`}reset(){this.sea.reset(),this.sea.setBelief(xt.constants.p0,!0),this.log=[],this.rules=null,this.trueRule=null,this.note="",this.budget(en),this.draw()}apply(e,t,n,s){e<36?this.sea.showFire(e,t):this.sea.showScan(e-36,t),this.sea.setBelief(n),this.log.push(Ey(e,t)),s&&(this.rules=s),this.draw()}draw(){let e=this.log.length?this.log.slice(-1).map((n,s,r)=>`<div style="opacity:${.5+.5*(s+1)/r.length}">${n}</div>`).join(""):"",t=this.rules?`<div class="rulebars">${Hn.map((n,s)=>`<div class="${this.trueRule===s?"true":""}"><span>${oa[n]}</span><u style="--p:${this.rules[s]}"></u><span>${Math.round(this.rules[s]*100)}%</span></div>`).join("")}</div>`:"";this.foot.innerHTML=`<div class="log">${e}</div>${t}`}};function Iy(){let i=new pl(ke("#panelA"),!0),e=new pl(ke("#panelB"),!1),t=ke("#controls"),n=ke("#results"),s="play",r=0,a=0,o,l,c,u,h,d=()=>xt.boards[r],f=()=>xt.llm.base?.games?.[d().seed]??d().runs.coder,g=()=>xt.llm.base?.label??"Agent",_=()=>xt.llm.tuned?.games?.[d().seed]??null;ke("#boards").innerHTML="Board "+xt.boards.map((A,U)=>`<button type="button" data-i="${U}">${U+1}</button>`).join(""),ui("#boards button").forEach(A=>A.addEventListener("click",()=>{r=+A.dataset.i,m()})),ui(".tab").forEach(A=>A.addEventListener("click",()=>{s=A.dataset.mode,m()})),ke('a[href="#rl"]').addEventListener("click",A=>{A.preventDefault(),s="rl",m(),ke("#play").scrollIntoView({behavior:"smooth"})});function m(){a++,u=!1,ui(".tab").forEach(A=>A.classList.toggle("on",A.dataset.mode===s)),ui("#boards button").forEach((A,U)=>A.classList.toggle("on",U===r)),n.hidden=!0,n.innerHTML="",i.reset(),e.reset(),s==="play"?w():C()}function p(A,U,B){let V=U.actions[B],$=U.results[B],q=U.beliefs[B+1];return A.apply(V,$,q.occ,q.rules),nr(V)}let y=(A,U)=>A.actions.slice(0,U).reduce((B,V)=>B+nr(V),0);function w(){o={belief:new pa,spent:0,i:0},l=0,c=0,i.sea.interactive=!0,i.sea.locked=!1,i.header("You"),i.draw(),e.header(g(),xt.llm.base?"":"proxy"),e.rules=f().beliefs[0].rules,e.note="Plays the same hidden board, shot for shot with your budget.",e.draw(),i.sea.onAction=b,M()}function M(){let A=en-o.spent;t.innerHTML=`
      <p class="hint">${A>0?"Click a cell to fire (1). Arrows scan a line (2).":"Budget spent."}</p>
      <button class="btn ghost" id="bayes" type="button" ${A>0?"":"disabled"}>Play the Bayes move</button>
      <button class="btn solid" id="tosubmit" type="button">${A>0?"Stop and submit":"Submit beliefs"}</button>`,ke("#bayes").addEventListener("click",()=>{let U=en-o.spent;U>0&&!u&&b(Du(o.belief,U))}),ke("#tosubmit").addEventListener("click",x)}async function b(A){let U=en-o.spent,B=nr(A);if(u||B>U)return;let V=a;u=!0;let $=Uu(d().layout,A,o.i,d().u);o.belief.update(A,$),o.spent+=B,o.i++,i.apply(A,$,o.belief.occupancy(),null),i.budget(en-o.spent),await E(o.spent,V),V===a&&(u=!1,M(),o.spent>=en&&x())}async function E(A,U){let B=f();for(;l<B.actions.length&&c<A;){if(await nf(380),U!==a)return;c+=p(e,B,l++),e.budget(en-c)}}function x(){i.sea.locked=!0;let A=null,U=.5;t.innerHTML=`
      <div class="guess">
        <div>
          <h3>Which rule placed the ships?</h3>
          
          <div class="chips">${Hn.map((B,V)=>`<button class="chip" type="button" data-k="${V}">${oa[B]}<small>${Ty[B]}</small></button>`).join("")}</div>
        </div>
        <div class="conf">
          <label><span>Confidence</span><b id="confv">50%</b></label>
          <input id="conf" type="range" min="17" max="99" value="50" aria-label="Confidence in your rule">
          <button class="btn solid" id="reveal" type="button" disabled>Reveal the board</button>
          ${o.spent<en?'<button class="btn ghost" id="back" type="button">Keep playing</button>':""}
        </div>
      </div>`,ui(".chip").forEach(B=>B.addEventListener("click",()=>{A=+B.dataset.k,ui(".chip").forEach(V=>V.classList.toggle("on",V===B)),ke("#reveal").disabled=!1})),ke("#conf").addEventListener("input",B=>{U=+B.target.value/100,ke("#confv").textContent=`${B.target.value}%`}),ke("#back")?.addEventListener("click",()=>{i.sea.locked=!1,M()}),ke("#reveal").addEventListener("click",()=>T(A,U))}async function T(A,U){let B=a,V=d(),$=f();if(t.innerHTML="",u=!0,await E(en,B),B!==a)return;let q=o.belief.occupancy(),Q=o.belief.rules(),ee=_l(Ou(A,U),q,V.rule,V.layout),ve=_l(Q,q,V.rule,V.layout).score_raw,Ie={...ee,design:ve,inference:ee.score_raw-ve},j=vl(V.layout);i.rules=Q,i.trueRule=e.trueRule=V.rule,i.log.push(`You said <b>${oa[Hn[A]]}</b> at ${Math.round(U*100)}%`),i.draw(),e.draw(),i.sea.reveal(j),e.sea.reveal(j);let ce=$.score,xe=V.runs.reference.score,Re=oa[Hn[V.rule]],fe=ce.inference<-.15?`The agent lost ${ts(Math.abs(ce.inference))} by trusting noisy reports.`:"Here the noise did not mislead the agent.",De=Ie.score_raw>ce.score_raw?`You beat the agent, ${ts(Ie.score_raw)} to ${ts(ce.score_raw)}.`:`The agent beat you, ${ts(ce.score_raw)} to ${ts(Ie.score_raw)}.`;n.hidden=!1,n.innerHTML=`
      <div class="scores">
        ${N("You",Ie,!0,"Your shots, scored with exact inference on the cells, plus your rule call.")}
        ${N(g()+(xt.llm.base?"":" (proxy)"),ce,!1)}
        ${N("Exact-Bayes reference",xe,!1)}
      </div>
      <div class="verdict">
        <p><b>${De}</b> The rule was <b>${Re}</b>. ${fe}</p>
        <div class="player">
          <button class="btn ghost" id="next" type="button">Next board</button>
          <button class="btn solid" id="torl" type="button">See the RL-tuned agent</button>
        </div>
      </div>`,t.innerHTML="",ke("#next").addEventListener("click",()=>{r=(r+1)%xt.boards.length,m()}),ke("#torl").addEventListener("click",()=>{s="rl",m()})}function N(A,U,B,V=""){return`<div class="score ${B?"lead":""}"><span class="lbl">${A}</span><b>${ts(U.score_raw)}</b>
      <p class="parts">Experiments ${_u(U.design)} \xB7 beliefs ${Math.abs(U.inference)<.005?"\xB10.00":`<em>${_u(U.inference)}</em>`}</p></div>`}function C(){let A=d(),U=f(),B=_(),V=B??A.runs.reference;h={k:0,playing:!1,runs:[U,V],done:!1},i.sea.interactive=!1,i.sea.onAction=null,i.header(`${g()}, out of the box`,xt.llm.base?"":"proxy"),i.rules=U.beliefs[0].rules,i.note="The same agent you just played against.",i.draw(),e.header(B?xt.llm.tuned.label:"After RL on this reward",B?"":"not yet measured",!B),e.rules=V.beliefs[0].rules,e.note=B?"Same model after RL on the exact reward.":"Showing the exact-Bayes reference: the play this reward trains toward. No tuned model has been run yet.",e.draw(),P()}function P(){t.innerHTML=`
      <p class="hint">Same board, same noise, same budget.</p>
      <button class="btn ghost" id="step" type="button">Step</button>
      <button class="btn solid" id="playpause" type="button">${h.playing?"Pause":"Play"}</button>`,ke("#step").addEventListener("click",()=>{h.playing=!1,F(),P()}),ke("#playpause").addEventListener("click",async()=>{h.playing=!h.playing,P();let A=a;for(;h.playing&&!h.done&&A===a;)F(),await nf(950)})}function F(){if(h.done)return;let[A,U]=h.runs,B=h.k++,V=Math.min(en,Math.max(y(A,h.ka||0),y(U,h.kb||0))+1);for(h.ka=h.ka||0,h.kb=h.kb||0;h.ka<A.actions.length&&y(A,h.ka)<V;)p(i,A,h.ka++);for(;h.kb<U.actions.length&&y(U,h.kb)<V;)p(e,U,h.kb++);i.budget(en-y(A,h.ka)),e.budget(en-y(U,h.kb)),h.ka>=A.actions.length&&h.kb>=U.actions.length&&G(B)}function G(){h.done=!0,h.playing=!1;let A=d(),[U,B]=h.runs,V=_(),$=vl(A.layout);i.trueRule=e.trueRule=A.rule,i.draw(),e.draw(),i.sea.reveal($),e.sea.reveal($);let q=B.score.score_raw-U.score.score_raw;n.hidden=!1,n.innerHTML=`
      <div class="scores">
        ${N(g()+(xt.llm.base?", base":" (proxy)"),U.score,!1)}
        ${N(V?xt.llm.tuned.label:"Exact-Bayes reference",B.score,!0)}
        <div class="score"><span class="lbl">${V?"Gain from RL":"Headroom for RL"}</span><b>${_u(q)}</b>
          <p class="parts">${V?"Same board, same noise.":"Gap to exact play on this board."}</p></div>
      </div>
      <div class="verdict">
        <p>${V?"":"<b>Right side is the reference, not a trained model yet.</b> "}The rule was <b>${oa[Hn[A.rule]]}</b>.</p>
        <div class="player">
          <button class="btn ghost" id="again" type="button">Next board</button>
          <a class="btn solid" href="#wetlab">Does it transfer?</a>
        </div>
      </div>`,t.innerHTML="",ke("#again").addEventListener("click",()=>{r=(r+1)%xt.boards.length,m()})}m(),window.__demo={A:i,B:e,humanAction:b,get mode(){return s},setMode(A){s=A,m()}}}function Py(){let i=new IntersectionObserver(e=>e.forEach(t=>{t.isIntersecting&&(t.target.classList.add("in"),i.unobserve(t.target))}),{threshold:.12});ui(".reveal").forEach(e=>i.observe(e))}Ry();Cy();Ay();Py();requestAnimationFrame(()=>setTimeout(async()=>{is(),await Qd(),Iy()},30));})();
/*! Bundled license information:

three/build/three.core.js:
three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2026 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
