import {chooseBotMove} from './bot.js';
self.onmessage=({data})=>{
  try{self.postMessage({move:chooseBotMove(data.state,data.difficulty,{budgetMs:data.budgetMs,onProgress:move=>self.postMessage({progress:true,move})})});}
  catch{self.postMessage({error:'Bot search failed.'});}
};
