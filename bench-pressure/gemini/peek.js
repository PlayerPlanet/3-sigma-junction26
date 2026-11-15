const { loadGame, snapshot } = require("./sim");
const { describe } = require("./gemini");
const g = loadGame(); g.setSeed(1003); g.newGame(1); const bot = g.makeBot(); g.setAuto({ bot });
console.log(describe(snapshot(g, bot)));
