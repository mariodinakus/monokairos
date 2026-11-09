/* Native MathML typesetting for the documented MONO forecasting equations.
   Static notation only. No external fonts, runtime scripts or mathematical reinterpretation. */
(function(root){
'use strict';
const r=(...a)=>'<mrow>'+a.join('')+'</mrow>';
const mi=x=>'<mi>'+x+'</mi>',n=x=>'<mn>'+x+'</mn>',op=x=>'<mo>'+x+'</mo>';
const sub=(x,y)=>'<msub>'+x+y+'</msub>',sup=(x,y)=>'<msup>'+x+y+'</msup>';
const frac=(a,b)=>'<mfrac>'+a+b+'</mfrac>';
const rootOf=x=>'<msqrt>'+x+'</msqrt>';
const sum=(low,high)=>'<munderover><mo>∑</mo>'+low+high+'</munderover>';
const yh=mi('ŷ'), w=sub(mi('w'),mi('m')), fm=sub(mi('f'),mi('m')),mae=sub(mi('MAE'),mi('m'));
const ysum=sum(r(mi('m'),op('='),n('1')),mi('M'));
const exp=x=>r(mi('exp'),op('('),x,op(')'));
const plus=op('+'),minus=op('−'),equals=op('='),times=op('·');
const formulas={
 '01':[r(yh,equals,frac(r(ysum,fm),mi('M')))],
 '01b':[r(sup(mi('m'),op('*')),equals,sub(mi('argmin'),mi('m')),mae),
        r(yh,equals,sub(mi('f'),sup(mi('m'),op('*'))))],
 '02':[r(sub(mi('b'),mi('m')),op('('),mi('h'),op(')'),equals,
        sub(mi('a'),mi('m')),plus,sub(mi('β'),mi('m')),mi('sin'),op('('),mi('ω'),op(')'),plus,sub(mi('γ'),mi('m')),mi('cos'),op('('),mi('ω'),op(')')),
       r(yh,equals,frac(r(ysum,w,op('('),fm,minus,sub(mi('b'),mi('m')),op('('),mi('h'),op(')'),op(')')),r(ysum,w)))],
 '03':[r(yh,equals,sub(mi('θ'),n('0')),plus,sub(mi('θ'),n('1')),mi('sin'),op('('),mi('ω'),op(')'),plus,sub(mi('θ'),n('2')),mi('cos'),op('('),mi('ω'),op(')'),plus,ysum,sub(mi('θ'),mi('m')),fm)],
 '04':[r(mi('P'),op('←'),mi('P'),plus,mi('Q'),op(';'),mi('K'),equals,frac(mi('P'),r(mi('P'),plus,mi('R')))),
       r(mi('b'),op('←'),mi('b'),plus,mi('K'),op('('),mi('e'),minus,mi('b'),op(')')),
       r(mi('P'),op('←'),op('('),n('1'),minus,mi('K'),op(')'),mi('P'))],
 '05':[r(yh,equals,frac(r(sum(mi('a'),mi('A')),sub(mi('w'),mi('a')),op('['),sub(mi('y'),mi('a')),plus,n('0.5'),op('('),mi('f̄'),minus,sub(mi('f̄'),mi('a')),op(')'),op(']')),r(sum(mi('a'),mi('A')),sub(mi('w'),mi('a'))))),
        r(sub(mi('w'),mi('a')),equals,frac(n('1'),r(sub(mi('d'),mi('a')),plus,n('0.05'))))],
 '05b':[r(sub(mi('w'),mi('j')),op('∝'),frac(n('1'),sup(r(mi('max'),op('('),sub(mi('MAE'),mi('j')),op(','),n('0.05'),op(')')),n('2'))),
         r(yh,equals,frac(r(sum(mi('j'),mi('J')),sub(mi('w'),mi('j')),sub(yh,mi('j'))),r(sum(mi('j'),mi('J')),sub(mi('w'),mi('j')))))],
 '06':[r(mi('p'),equals,frac(n('1'),r(n('1'),plus,exp(r(minus,op('('),sub(mi('w'),n('0')),plus,sub(mi('w'),n('1')),mi('φ'),plus,sub(mi('w'),n('2')),mi('ln'),op('('),n('1'),plus,mi('ā'),op(')'),op(')'))))))],
 '06b':[r(mi('p'),equals,n('0.5'),sub(mi('p'),mi('MONO')),plus,n('0.5'),sub(mi('p'),mi('ensemble')))],
 '07':[r(mi('Δ'),op('('),mi('t'),op(')'),equals,mi('s'),mi('c'),op('('),mi('h'),op(')'),plus,sub(mi('e'),n('0')),exp(r(minus,frac(r(mi('t'),minus,sub(mi('t'),n('0'))),mi('τ')))))],
 '08':[r(mi('σ'),equals,mi('max'),op('('),n('0.5'),op(','),rootOf(r(n('0.5'),sup(sub(mi('σ'),mi('ens')),n('2')),plus,n('0.5'),sup(sub(mi('σ'),mi('hist')),n('2')))),op(')')),
       r(n('80'),op('%'),op(':'),yh,op('±'),n('1.2816'),mi('σ'))],
 '09':[r(mi('MAE'),equals,frac(r(sum(r(mi('i'),equals,n('1')),mi('N')),op('|'),sub(yh,mi('i')),minus,sub(mi('y'),mi('i')),op('|')),mi('N'))),
       r(mi('Brier'),equals,frac(r(sum(r(mi('i'),equals,n('1')),mi('N')),sup(r(op('('),sub(mi('p'),mi('i')),minus,sub(mi('o'),mi('i')),op(')')),n('2'))),mi('N')))]
};
function render(id,plain){
 const lines=formulas[String(id)];
 if(!lines)return '<div class="equation-formula">'+String(plain||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))+'</div>';
 const escaped=String(plain||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 return '<div class="equation-formula equation-typeset" role="group" aria-label="'+escaped.replace(/\n/g,' · ')+'">'+
  lines.map(line=>'<div class="equation-math-line"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block">'+line+'</math></div>').join('')+
  '</div>';
}
const api={render,formulas};
root.MONOMathTypeset=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
