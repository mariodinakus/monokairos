const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../equations.js');
const train={temp:{leads:{0:{choice:'combo',combo:{ridge:.7,mos:.3},prod:{ridge:{use:['gfs'],w:[1,2,3,.7]},mos:{models:{gfs:{weight:1,bias:[.1,.2,.3]}}}}}}},wind:{leads:{0:{choice:'mean'}}},precip:{leads:{0:{choice:'logistic',prod:{logistic:{w:[.1,2,3]}}}}}};
test('shows selected methods and production parameters for the selected horizon',()=>{
 const html=E.render({train,lead:0,mode:'equations',city:'<X>',algorithmName:x=>x,modelName:x=>x});
 assert.match(html,/combo/);assert.match(html,/ridge: 70%/);assert.match(html,/gfs: 0,7/);assert.match(html,/w1 = 2/);assert.match(html,/gfs: 100%/);assert.match(html,/&lt;X&gt;/);
 assert.doesNotMatch(E.render({train,lead:1,mode:'equations'}),/ridge: 70%/);
});
test('missing training is explicit and simple mode stays readable in both languages',()=>{
 assert.match(E.render({mode:'equations'}),/δεν είναι διαθέσιμη/);
 const simple=E.render({lang:'en'});assert.match(simple,/In plain language/);assert.match(simple,/Unavailable/);assert.doesNotMatch(simple,/exp\(/);
});
test('not-selected candidate coefficients are not presented as active',()=>{
 const t=structuredClone(train);t.temp.leads[0].choice='mean';t.precip.leads[0].choice='vote';
 const html=E.render({train:t,mode:'equations'});assert.doesNotMatch(html,/Συντελεστές ridge θερμοκρασίας/);assert.doesNotMatch(html,/Συντελεστές logistic βροχής/);
});
