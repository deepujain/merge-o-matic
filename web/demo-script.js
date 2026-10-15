// The hackathon demo script: one step per feature, read in order by demo.js. text is the caption; say, when given, is
// what the voice-over reads, spelled for text-to-speech. scripts/merge-o-matic-voice.mjs turns each step into a clip.
export const STEPS=[
  {id:'intro',text:"This is Merge-O-Matic, a receipt printer for your merged pull requests. Tonight it's dressed for Halloween. The O is a carved pumpkin, and now and then it bubbles into a cauldron and a witch flies out on her broom. Keep an eye out for the bats and the spiders.",
    say:"This is Merge-O-Matic, a receipt printer for your merged pull requests. Tonight, it's dressed for Halloween. The O is a carved pumpkin, and now and then, it bubbles into a cauldron, and a witch flies out on her broom. Keep an eye out for the bats, and the spiders."},
  {id:'login',text:"Start with any GitHub username. I'll type deepujain. Or press Try deepujain, a shortcut that fills it in for you.",
    say:"Start with any GitHub username. I'll type, deepu jain. Or press, Try deepu jain, a shortcut that fills it in for you."},
  {id:'repo',text:"Merge-O-Matic lists every public repository where that person has merged pull requests, with a count for each. I'll pick NVIDIA NemoClaw.",
    say:"Merge-O-Matic lists every public repository where that person has merged pull requests, with a count for each. I'll pick, NVIDIA Nemo Claw."},
  {id:'ranges',text:"Next, choose the shift: Week, Month, Quarter, Year, which also opens earlier years, or All time. The badge counts this week's merges. Let's print this week.",
    say:"Next, choose the shift. Week. Month. Quarter. Year, which also opens earlier years. Or All time. The badge counts this week's merges. Let's print this week."},
  {id:'print',text:"Meet the MERGE-O-MATIC 40. The LCD reads READY with this week's totals. I press PRINT. It warms up, the keys light up in a chase, and the paper feeds with real printer sounds. Then it tears itself off.",
    say:"Meet the Merge-O-Matic forty. The L C D reads, ready, with this week's totals. I press print. It warms up, the keys light up in a chase, and the paper feeds, with real printer sounds. Then, it tears itself off."},
  {id:'receipt',text:"Every line is a merged pull request, with its files, checks and comments. BAGGED BY shows who approved it. Down in the totals, tests and docs are charged as tax. CI TEND counts the pull requests that passed their checks, and the footer tells you how many lines you saved.",
    say:"Every line is a merged pull request, with its files, checks, and comments. Bagged by, shows who approved it. Down in the totals, tests and docs are charged as tax. C I tend, counts the pull requests that passed their checks, and the footer tells you how many lines you saved."},
  {id:'share',text:"Share sends the receipt image to your phone or chat. Download saves it as an image."},
  {id:'record',text:"Record makes a video, right in the browser. Film the whole page, like this demo, or just the machine printing, with its own sound. Nothing is uploaded."},
  {id:'styles',text:"The T button changes the look. Here's Crayon. Here's Normal. Each one comes in Light and Dark, and the music button plays a tune to match. But tonight, it's Halloween.",
    say:"The T button changes the look. Here's Crayon. Here's Normal. Each one comes in light and dark, and the music button plays a tune to match. But tonight, it's Halloween."},
  {id:'about',text:"The i button covers privacy. Pull requests and receipts are never stored, and prints are counted anonymously. The meter shows how much GitHub lookup capacity is left.",
    say:"The i button covers privacy. Pull requests and receipts are never stored, and prints are counted anonymously. The meter shows how much GitHub lookup capacity is left."},
  {id:'link',text:"Every receipt has its own link. The username, repository and range live in the address, so anyone who opens it sees the same receipt."},
  {id:'outro',text:"That's Merge-O-Matic. Print your merges, share your receipt, and have a spooky Halloween.",
    say:"That's Merge-O-Matic. Print your merges, share your receipt, and have a spooky Halloween!"}
];
