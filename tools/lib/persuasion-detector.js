/*! Persuasion Lab — Manipulation Detector engine (rule-based, no network). Built from packages/shared/src/detector.ts. Do not edit by hand. */
(function (global) {
'use strict';
/**
 * Persuasion Lab — rule-based Manipulation Detector engine (no AI, no network).
 *
 * Design goals
 *  1. Technique-level output. Every hit maps to an encyclopedia technique id, a harm class,
 *     an explanation, and a defense — not just a word bucket.
 *  2. Structure, not vocabulary. Coercion rarely uses "scary words". A bribe plus a
 *     conditional threat ("I'll give you $1000 … if you don't, I won't …") has no loaded
 *     vocabulary at all, so the engine detects sentence structure: if-you-don't/I-will,
 *     pay-then-do inducements, directives, reward withdrawal, ultimatums.
 *  3. Honest epistemics. Hedging ("perhaps", "to the best of my knowledge") is a mark of
 *     integrity and is NOT flagged; only weasel attributions ("some say", "experts agree")
 *     and unearned certainty ("the science is settled") are. Every result carries a
 *     confidence level and a list of what this engine cannot see.
 *  4. Calibration. Scores are density-aware, per-rule hits have diminishing returns,
 *     harm class weights severity, and co-occurrence signatures (scam triad, carrot-and-
 *     stick, coercive-control cluster, propaganda cluster) add what single rules miss.
 *
 * This file must stay free of runtime imports so it can be transpiled into a standalone
 * browser bundle (scripts/build-standalone-detector.js) for the demo tool.
 */
const DETECTOR_VERSION = '2.0.0';
const BUCKET_META = {
    pressure: { label: 'Urgency & Scarcity', description: 'Deadlines, countdowns, limited stock, fear of missing out — devices that shorten the time you have to think.', color: '#fb8500' },
    emotion: { label: 'Emotional Triggers', description: 'Loaded words, fear, outrage, pity, flattery — feelings raised beyond what the facts support.', color: '#c44a8a' },
    'authority-proof': { label: 'Authority & Social Proof', description: 'Unnamed experts, crowds, testimonials, and credentials offered in place of evidence.', color: '#00d4aa' },
    fallacy: { label: 'Logical Fallacies', description: 'Argument structures that feel like reasoning but do not support the conclusion.', color: '#8b5cf6' },
    propaganda: { label: 'Propaganda & Othering', description: 'Us-versus-them framing, dehumanization, conspiracy frames, thought-terminating clichés, glittering generalities.', color: '#e63946' },
    coercion: { label: 'Threats & Coercion', description: 'Conditional threats, bribes, ultimatums, reward withdrawal, and directive pressure — influence by force rather than reasons.', color: '#ff4d6d' },
    abuse: { label: 'Gaslighting & Control', description: 'Reality denial, blame reversal, minimization, isolation, guilt and obligation — the language of coercive control.', color: '#4cc9f0' },
    deception: { label: 'Evasion, Weasel Language & Deceptive Design', description: 'Unattributed claims, non-denial denials, agentless euphemism, secrecy requests, unearned certainty, and dark patterns in checkout and subscription copy (confirmshaming, hidden fees, hard-to-cancel terms).', color: '#d4a020' },
    scam: { label: 'Scam & Social Engineering', description: 'Account alerts, prizes, payment-method demands, remote-access requests, romance-plus-money patterns.', color: '#ff9f1c' },
    engagement: { label: 'Clickbait & Engagement Bait', description: 'Curiosity gaps, share-before-deleted, like-if-you-agree, MLM recruitment language, streak and referral pressure.', color: '#2ec4b6' },
};
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** Build a case-insensitive, word-bounded alternation from a phrase list. Apostrophes may be typed straight or curly. */
function ph(list) {
    const alts = list
        .slice()
        .sort((a, b) => b.length - a.length)
        .map((p) => escapeRe(p).replace(/'/g, "['’]").replace(/\\ /g, '\\s+'));
    return new RegExp('(?<![A-Za-z0-9])(?:' + alts.join('|') + ')(?![A-Za-z0-9])', 'gi');
}
function normalize(text) {
    // Same-length replacements only, so match indices map back to the original string.
    return text
        .replace(/[‘’‛]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/ /g, ' ');
}
function words(text) {
    return text.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
}
function sentences(text) {
    return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
}
function syllables(word) {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 3)
        return 1;
    const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
    return Math.max(1, m ? m.length : 1);
}
const FUNCTION_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their', 'and', 'or', 'but', 'if', 'so', 'not', 'no']);
// ─────────────────────────────────────────────────────────────────────────────
// Phrase lists (kept narrow on purpose — false positives teach paranoia)
// ─────────────────────────────────────────────────────────────────────────────
const URGENCY = ['act now', 'act fast', 'act immediately', 'right now or', 'limited time', 'limited-time', 'last chance', 'final chance', 'now or never', 'while supplies last', 'time is running out', 'running out of time', "before it's too late", 'before it is too late', "don't wait", 'do not wait', 'expires today', 'expires tonight', 'expires at midnight', 'ends tonight', 'ends today', 'ends at midnight', 'today only', 'this weekend only', 'flash sale', 'selling fast', 'going fast', 'almost gone', 'only a few left', 'only a few spots', 'spots are filling', 'closing soon', 'while you still can', 'final warning', 'final notice', 'last warning', 'immediate action required', 'immediate action is required', 'respond within', 'within 24 hours', 'within 48 hours', 'you have 24 hours', 'you have until', 'clock is ticking', 'point of no return', 'this offer will not be repeated', 'once in a lifetime', 'hurry', 'midnight tonight', 'tonight at midnight', 'by midnight', 'at midnight', 'discontinuing', 'being discontinued', 'will no longer be available', 'no longer be offered', 'last day', 'final day', 'final hours', 'last few hours', 'before the price goes up', 'before prices go up', 'price goes up', 'prices go up', 'price increase', 'rates go up', 'lock in the', 'lock in your', 'lock in this', 'right away', 'right now', 'this instant', 'without delay', 'pay immediately', 'respond immediately', 'call immediately', 'act immediately', 'verify immediately', 'to avoid arrest', 'to avoid legal action', 'to avoid prosecution', 'to avoid a penalty', 'to avoid late fees'];
const SCARCITY = ['only 2 left', 'only 3 left', 'only 1 left', 'only one left', 'only two left', 'only a handful', 'limited availability', 'limited stock', 'limited quantities', 'limited edition', 'exclusive offer', 'members only', 'invitation only', 'by invitation', 'not for everyone', 'first come first served', 'first-come, first-served', 'in high demand', 'high demand', 'others are viewing', 'people are viewing', 'people are looking at this', 'booked 12 times', 'selling out', 'sold out soon', 'get in early', 'before everyone else', 'early access'];
const FOMO = ["don't miss out", 'do not miss out', "you're missing out", 'you are missing out', "don't be left behind", 'left behind', "don't miss this", 'everyone is talking about', 'everybody is talking about', "you'll regret missing", 'miss out on', 'the one thing you cannot afford to miss', "can't afford to miss", 'cannot afford to miss'];
const LOADED_OUTRAGE = ['shocking', 'outrageous', 'disgusting', 'disgraceful', 'sickening', 'appalling', 'vile', 'despicable', 'horrifying', 'terrifying', 'devastating', 'catastrophic', 'apocalyptic', 'nightmare scenario', 'slap in the face', 'stab in the back', 'betrayal', 'betrayed us', 'war on', 'assault on', 'attack on our', 'an attack on', 'they are laughing at us', 'laughing at you', 'insult to', 'spit in the face'];
const FEAR = ['if we lose this', 'we will lose everything', "you'll lose everything", 'you will lose everything', 'your family is at risk', 'your family will', 'your children will', 'our children will', 'will be destroyed', 'destroy everything', 'end of our way of life', 'our way of life', 'existential threat', 'under siege', 'under attack', 'ticking time bomb', 'they are coming for', "they're coming for", 'coming for your', 'will take your', 'take away your', 'you could lose your', 'before they take', 'nothing will be left', 'will not survive', "won't survive", 'imagine what happens if', 'it will be too late'];
const PITY = ['after all i have been through', "after all i've been through", 'i have nothing left', "i've got nothing left", 'no one else will help me', 'nobody else will help', 'you are my only hope', "you're my only hope", 'i am begging you', "i'm begging you", 'i will be out on the street', 'i have no one else', "i've got no one else"];
const FLATTERY = ['someone as smart as you', 'a person of your intelligence', 'you are too smart to', "you're too smart to", 'a smart person like you', 'people like you understand', 'i can tell you are', "i can tell you're", 'you clearly understand', 'unlike most people, you', 'you are one of the few', "you're one of the few", 'only someone like you', 'i knew you would understand', "i knew you'd understand", 'you have always been the reasonable one', "you've always been the reasonable one"];
const GLITTERING = ['common-sense solutions', 'common sense solutions', 'real change', 'true freedom', 'our values', 'the right side of history', 'wrong side of history', 'a brighter future', 'a better tomorrow', 'take our country back', 'take back our country', 'restore our', 'protect our way of life', 'defend our values', 'family values', 'the american dream', 'for the people', 'of the people', 'stand for something', 'believe in something', 'the future is now', 'the future belongs to'];
const WEASEL = ['some say', 'some people say', 'many people say', 'many people are saying', 'people are saying', 'a lot of people are saying', 'some people think', 'it has been said', 'it is said that', 'it is believed that', 'it is widely believed', 'sources say', 'sources tell', 'insiders say', 'critics say', 'some argue', 'it could be argued', 'there are those who say', 'questions have been raised', 'concerns have been raised', 'is widely regarded', 'is considered by many', 'many experts believe', 'experts say', 'experts agree', 'experts warn', 'scientists say', 'scientists agree', 'doctors recommend', 'doctors agree', 'studies show', 'studies prove', 'research shows', 'research proves', 'statistics show', 'it is well known', 'everybody knows', 'everyone knows', 'as everyone knows', 'it is no secret', "it's no secret", 'up to', 'as much as', 'as many as', 'virtually', 'helps to', 'can help', 'may help', 'is known to', 'clinically proven', 'scientifically proven', 'proven to work', 'results may vary', 'some restrictions apply', 'in a sense', 'for all intents and purposes'];
const NON_DENIAL = ['i do not recall', "i don't recall", 'i have no recollection', 'i have no knowledge of', 'no evidence that i', 'i was not aware', "i wasn't aware", 'to my knowledge no', 'i cannot comment', "i can't comment", 'i can neither confirm nor deny', 'that is not something i', "that's not something i", 'i have been advised not to', 'mistakes were made', 'errors were made', 'the decision was taken', 'it was decided', 'shots were fired', 'things got out of hand', 'that is not what this is about', 'we have moved on', 'i have moved on', 'that is old news', "that's old news", 'the matter is closed', 'i am not going to relitigate', "i'm not going to relitigate", 'what i actually said was', 'that was taken out of context', 'taken out of context', 'i misspoke', 'if anyone was offended', 'if i offended anyone', 'i regret if', 'sorry you feel that way', "sorry that you feel"];
const CERTAINTY = ['the science is settled', 'science is settled', 'the debate is over', 'there is no debate', 'no serious person', 'no reasonable person', 'no one disputes', 'nobody disputes', 'undeniable', 'undeniably', 'irrefutable', 'irrefutably', 'indisputable', 'indisputably', 'beyond any doubt', 'beyond all doubt', 'without a doubt', 'there is no question', 'it is a proven fact', 'proven fact', 'documented fact', '100% guaranteed', 'one hundred percent guaranteed', 'guaranteed to', 'absolutely guaranteed', 'cannot fail', "can't fail", 'zero risk', 'risk-free', 'risk free', 'no risk', 'nothing to lose', 'case closed', 'end of story', 'end of discussion', 'period, full stop', 'full stop', 'plain and simple', 'make no mistake', 'the fact is', 'fact is', 'the truth is', 'the simple truth', 'the real truth'];
const THOUGHT_TERMINATING = ['it is what it is', "that's just how it is", "that's just the way it is", 'that is just the way it is', 'everything happens for a reason', 'boys will be boys', 'agree to disagree', "let's agree to disagree", "you can't fight city hall", "don't rock the boat", 'rules are rules', "if it ain't broke", 'at the end of the day', 'it goes without saying', 'need i say more', "that's just human nature", 'that is just human nature', 'enough said', 'you either get it or you don\'t', 'you just don\'t get it', "you wouldn't understand", 'you would not understand', "you'll understand when you're older", 'trust the plan', 'do your own research', 'wake up', 'stay woke', 'think for yourself', 'open your eyes', 'follow the science', 'trust the science', 'the experts have spoken', 'this is settled', "we've always done it this way", 'we have always done it this way', "because i said so", 'because i say so', 'it is not your place', "it's not your place", 'stay in your lane', 'know your place'];
const US_THEM = ['those people', 'these people', 'people like them', 'people like that', 'their kind', 'that kind of people', 'the other side', 'us versus them', 'us against them', 'us vs them', 'us vs. them', 'the enemy within', 'enemies of the people', 'enemy of the people', 'enemy of the state', 'traitors', 'traitor', 'un-american', 'anti-american', 'real americans', 'true patriots', 'real patriots', 'the silent majority', 'the elites', 'the globalists', 'globalist', 'the establishment', 'the swamp', 'the regime', 'the ruling class', 'the parasites', 'the takers', 'the makers', 'the deplorables', 'the woke mob', 'the mob', 'the rabble', 'the sheep', 'sheeple', 'normies', 'the masses', 'they hate us', 'they hate you', 'they want to destroy', 'they want you', 'they are not like us', "they're not like us", 'they will never', 'they always', 'they only want', 'they don\'t care about you', 'they do not care about you', 'not one of us', 'one of them', 'if you are not with us', "if you're not with us", 'with us or against us', 'either with us or', 'on our side or'];
const DEHUMANIZATION = ['vermin', 'cockroaches', 'rats infesting', 'parasites', 'parasitic', 'infestation', 'infesting', 'a plague on', 'a cancer on', 'cancer on society', 'a disease on', 'subhuman', 'sub-human', 'less than human', 'not even human', 'animals, not people', 'they are animals', "they're animals", 'human garbage', 'scum of the earth', 'filth', 'exterminate', 'extermination', 'eradicate them', 'eradicate these', 'wipe them out', 'wipe them all out', 'cleanse', 'cleansing', 'purge', 'purify our', 'invaders', 'an invasion of', 'swarm of', 'swarming', 'breeding', 'breeders', 'contaminating', 'polluting our', 'poisoning our'];
const VIOLENCE = ['string them up', 'string him up', 'string her up', 'hang them', 'hang him', 'hang her', 'lynch', 'take them out', 'take him out', 'take her out', 'put them down', 'burn it to the ground', 'burn it all down', 'burn them', 'second amendment solutions', 'second amendment remedies', 'we know where you live', 'i know where you live', 'we know where they live', 'watch your back', 'you will pay for this', "you'll pay for this", 'you will regret this', "you'll regret this", 'you will be sorry', "you'll be sorry", 'i will make you pay', "i'll make you pay", 'i will hurt you', "i'll hurt you", 'i will ruin you', "i'll ruin you", 'i will destroy you', "i'll destroy you", 'you will never work again', "you'll never work in this", 'i will make sure everyone knows', "i'll make sure everyone knows", 'i will tell everyone', "i'll tell everyone", 'everyone will know what you', 'i have pictures', 'i have the screenshots', 'i have proof and i will', 'i will release', "i'll release", 'i will expose you', "i'll expose you"];
const CONSPIRACY = ["they don't want you to know", 'they do not want you to know', 'what they are hiding', "what they're hiding", 'the truth they are hiding', 'the media won\'t tell you', 'the media will not tell you', 'mainstream media won\'t', 'the mainstream media', 'msm won\'t', 'the news won\'t cover', 'being covered up', 'cover-up', 'coverup', 'cover up', 'the real reason', 'the real agenda', 'their true agenda', 'hidden agenda', 'secret agenda', 'follow the money', 'cui bono', 'connect the dots', 'nothing is a coincidence', 'no coincidences', 'there are no coincidences', 'false flag', 'crisis actors', 'crisis actor', 'deep state', 'new world order', 'plandemic', 'controlled opposition', 'puppet masters', 'pulling the strings', 'behind the curtain', 'they are all in on it', "they're all in on it", 'wake up people', 'red pill', 'red-pilled', 'red pilled', 'the truth movement', 'suppressed', 'censored truth', 'banned truth', 'they will delete this', 'before this gets deleted', 'before it gets taken down', 'before they take this down', 'share before it is deleted', "share before it's deleted", 'big pharma', 'big tech', 'big ag', 'big oil', 'the powers that be', 'the cabal', 'the illuminati', 'chemtrails', 'they are lying to you', "they're lying to you", 'everything you were told is a lie', 'everything you know is a lie', 'the official story', 'the official narrative', 'question everything', 'do your own research'];
const GASLIGHTING = ['that never happened', "that didn't happen", 'that did not happen', 'it never happened', "you're imagining things", 'you are imagining things', "you're imagining it", 'you imagined it', "you're making things up", 'you are making things up', "you're making that up", "you made that up", "you're remembering it wrong", 'you are remembering it wrong', "you're misremembering", 'you must be confused', "you're confused", 'you are confused', "you're too sensitive", 'you are too sensitive', "you're being too sensitive", "you're overreacting", 'you are overreacting', "you're being dramatic", 'stop being dramatic', "you're being paranoid", 'you are being paranoid', "you're paranoid", "you're crazy", 'you are crazy', "you're insane", 'you sound crazy', 'you sound insane', "you're losing it", 'you are losing it', 'i never said that', 'i never did that', "i didn't say that", 'i did not say that', 'i would never say that', "that's not what i said", 'that is not what i said', "that's not what happened", 'that is not what happened', 'everyone thinks you', 'everybody thinks you', 'everyone agrees with me', 'nobody else has a problem', 'no one else has a problem', "you're the only one who", 'you are the only one who', 'no one else thinks', 'nobody else thinks', 'it was just a joke', 'it was only a joke', "can't you take a joke", 'you can\'t take a joke', 'learn to take a joke', "you're too emotional", 'you are too emotional', 'you need help', 'you should get help', "there's something wrong with you", 'there is something wrong with you', 'you always do this', 'you always twist', "you're twisting my words", 'you are twisting my words', 'why are you doing this to me', 'what is wrong with you', "what's wrong with you"];
const DARVO = ["i'm the real victim", 'i am the real victim', "i'm the victim here", 'i am the victim here', "you're the one who", 'you are the one who', 'you started it', 'you started this', 'this is your fault', 'this is all your fault', 'it is your fault', "it's your fault", 'you drove me to this', 'you drove me to it', 'you made me do it', 'you made me do this', 'look what you made me do', "look what you've done", 'look what you did', "i wouldn't have to if you", 'i would not have to if you', 'if you hadn\'t', 'if you had not', 'how dare you accuse me', 'how dare you', 'after everything i have done for you', "after everything i've done for you", 'after all i have done for you', "after all i've done for you", 'i can\'t believe you would think that of me', 'you are attacking me', "you're attacking me", 'now i am the bad guy', "now i'm the bad guy", 'so now i am the villain', "so now i'm the villain", 'you are so ungrateful', "you're so ungrateful", 'you always blame me', 'you never take responsibility'];
const MINIMIZATION = ["it's not a big deal", 'it is not a big deal', "it wasn't that bad", 'it was not that bad', "you're making a big deal", 'making a big deal out of nothing', 'making a mountain out of a molehill', 'get over it', 'just get over it', 'move on already', 'let it go already', 'it was nothing', "it's nothing", 'why are you still on this', 'why are you still talking about', 'that was ages ago', 'that was so long ago', 'you need to let it go', 'stop living in the past', 'other people have it worse', 'you should be grateful', 'be grateful it wasn\'t worse', 'at least i didn\'t', 'at least i did not', 'it could have been worse', 'i barely touched', 'i hardly', 'i only'];
const ISOLATION = ["your friends don't really care", 'your friends do not really care', 'your friends are using you', 'your family is toxic', 'your family doesn\'t understand', 'your family does not understand', "they're just jealous of us", 'they are just jealous', "they don't understand us", 'they do not understand us', "you don't need them", 'you do not need them', "you don't need anyone else", 'you do not need anyone else', 'it is us against the world', "it's us against the world", 'us against the world', 'no one understands you like i do', 'nobody understands you like i do', 'no one will ever love you like', 'nobody will ever love you like', 'i am the only one who', "i'm the only one who", 'i am all you have', "i'm all you have", 'i am all you need', "i'm all you need", 'why do you need to see them', 'why do you have to see them', 'you spend too much time with', 'they are a bad influence', "they're a bad influence", 'you should not talk to', "you shouldn't talk to", "i don't want you talking to", 'i do not want you talking to', 'who were you with', 'who were you talking to', 'why didn\'t you answer', 'why did you not answer', 'where were you', 'i checked your phone', 'let me see your phone', 'show me your phone', 'i need your password', 'give me your password', 'i track your', 'i know where you were'];
const GUILT = ['after everything i have done', "after everything i've done", 'after all i have done', "after all i've done", 'i gave up everything for you', 'i sacrificed everything', 'i sacrifice everything', 'you owe me', 'you owe it to me', 'how could you do this to me', 'how could you', 'i guess i will just', "i guess i'll just", 'fine, do whatever you want', 'fine, whatever', 'do what you want, i don\'t care', "don't worry about me", 'do not worry about me', 'never mind, i will manage', 'i will be fine on my own', "i'll be fine on my own", 'if you really cared', 'if you really loved me', 'if you loved me', 'if you cared about me', 'a real friend would', 'a good daughter would', 'a good son would', 'a good wife would', 'a good husband would', 'a real man would', 'a real woman would', 'i thought you were different', 'i thought i could count on you', 'i thought i could trust you', 'you are just like everyone else', "you're just like everyone else", 'you are breaking my heart', "you're breaking my heart", 'you are killing me', "you're killing me", 'no one cares about me', 'nobody cares about me', 'i suppose i deserve this'];
const EMOTIONAL_BLACKMAIL = ['if you leave me i will', "if you leave me i'll", 'if you leave i will', "if you leave i'll", "i can't live without you", 'i cannot live without you', 'i will die without you', "i'll die without you", "i'll kill myself", 'i will kill myself', 'i will hurt myself', "i'll hurt myself", 'you will have to live with that', "you'll have to live with that", 'it will be on your conscience', 'on your conscience', 'you will be responsible for what happens', "you'll be responsible", 'you will regret leaving', "you'll regret leaving", 'no one else will ever want you', 'nobody else will ever want you', 'you will never find anyone', "you'll never find anyone", 'you will be nothing without me', "you'll be nothing without me", 'you are nothing without me', "you're nothing without me", 'i will take the kids', "i'll take the kids", 'you will never see the kids', "you'll never see the kids", 'i will tell them what you did', "i'll tell them what you did", 'i will tell your family', "i'll tell your family"];
const ULTIMATUM = ['or else', 'take it or leave it', 'final offer', 'my final offer', 'this is not negotiable', 'non-negotiable', "it's me or", 'it is me or', 'choose right now', 'decide right now', 'you have until', 'you have exactly', 'i am giving you until', "i'm giving you until", 'this is your last chance', 'your last chance', 'last chance to', "don't make me", 'do not make me', "you'd better", 'you had better', 'you better', 'or i walk', 'or i am done', "or i'm done", 'or we are done', "or we're done", 'or it is over', "or it's over"];
const REWARD_WITHDRAWAL = ["i won't be", 'i will not be', "i won't do", 'i will not do', "i won't help", 'i will not help', "i won't pay", 'i will not pay', "i won't cover", "don't expect me to", 'do not expect me to', "you can forget about", 'you can forget', 'no more', 'not anymore', "won't be getting", 'will not be getting', 'you can kiss goodbye', 'say goodbye to', 'i will stop', "i'll stop", 'i will cut you off', "i'll cut you off", 'cut off', 'i will withhold', 'you get nothing'];
const SECRECY = ["don't tell anyone", 'do not tell anyone', "don't tell anybody", 'tell no one', 'tell nobody', 'keep this between us', 'keep it between us', 'between you and me', 'this stays between us', 'our little secret', 'keep this confidential', 'strictly confidential', 'do not discuss this with', "don't discuss this with", "don't mention this to", 'do not mention this to', 'nobody needs to know', 'no one needs to know', 'no one has to know', "don't involve", 'do not involve', "don't tell your", 'do not tell your', 'they would not understand', "they wouldn't understand", 'if you tell anyone', 'if anyone finds out', 'do not call the', "don't call the", 'do not contact', "don't contact"];
const SCAM_ACCOUNT = ['verify your account', 'verify your identity', 'confirm your identity', 'confirm your account', 'confirm your details', 'update your payment', 'update your billing', 'update your information', 'unusual activity', 'suspicious activity', 'unusual sign-in', 'unusual login', 'unauthorized access', 'unauthorised access', 'your account has been', 'your account will be', 'account will be suspended', 'account has been suspended', 'account has been locked', 'account will be locked', 'account has been compromised', 'account will be closed', 'account will be terminated', 'temporarily suspended', 'permanently suspended', 'failure to respond', 'failure to verify', 'to avoid suspension', 'to avoid termination', 'to restore access', 'to regain access', 'click here to verify', 'click the link below', 'click below to', 'login to confirm', 'log in to confirm', 'sign in to confirm', 'reset your password immediately', 'your password has expired', 'password will expire', 'security alert', 'security notice', 'important notice', 'action required', 'dear customer', 'dear user', 'dear account holder', 'dear valued customer', 'dear member', 'valued customer', 'we were unable to deliver', 'could not be delivered', 'delivery attempt', 'redelivery fee', 'reschedule your delivery', 'customs fee', 'a small fee', 'pending package', 'your package is waiting', 'track your package here'];
const SCAM_PRIZE = ["you've been selected", 'you have been selected', "you've won", 'you have won', 'you are a winner', "you're a winner", 'congratulations, you', 'congratulations you', 'claim your prize', 'claim your reward', 'claim your gift', 'claim your refund', 'you are eligible for', "you're eligible for", 'you qualify for', 'free gift card', 'free iphone', 'lucky winner', 'grand prize', 'lottery', 'sweepstakes', 'inheritance', 'unclaimed funds', 'unclaimed money', 'beneficiary', 'next of kin', 'compensation fund', 'tax refund', 'refund is waiting', 'stimulus payment', 'government grant', 'you are owed', "you're owed"];
const SCAM_PAYMENT = ['gift card', 'gift cards', 'itunes card', 'apple card', 'google play card', 'steam card', 'prepaid card', 'wire transfer', 'wire the money', 'wire the funds', 'western union', 'moneygram', 'bitcoin atm', 'crypto atm', 'send bitcoin', 'send crypto', 'in bitcoin', 'in crypto', 'zelle', 'cash app', 'venmo', 'cashier\'s check', "cashier's check", 'certified check', 'send the difference', 'refund the difference', 'return the excess', 'overpaid', 'overpayment', 'processing fee', 'transfer fee', 'release fee', 'clearance fee', 'activation fee', 'to release the funds', 'to unlock the funds', 'pay the fee first', 'small upfront', 'upfront payment', 'advance payment', 'deposit to secure', 'move your money', 'move the money to a safe account', 'safe account', 'protect your money by', 'transfer it to a secure', 'secure account'];
const SCAM_AUTHORITY = ['this is the irs', 'from the irs', 'irs agent', 'internal revenue service', 'social security administration', 'your social security number has been', 'your ssn has been', 'suspended your social security', 'arrest warrant', 'warrant for your arrest', 'a warrant has been issued', 'legal action will be taken', 'legal action against you', 'you will be arrested', 'law enforcement will', 'the police will', 'police officer', 'federal agent', 'department of justice', 'medicare representative', 'from microsoft', 'microsoft support', 'windows support', 'apple support', 'amazon security', 'your bank\'s fraud department', 'fraud department', 'fraud prevention team', 'we detected a virus', 'your computer has a virus', 'your computer is infected', 'your device is infected', 'your computer has been hacked', 'call this number', 'call us immediately at', 'call the number below', 'do not hang up', "don't hang up", 'stay on the line', 'remote access', 'grant us access', 'install this software', 'download this tool', 'anydesk', 'teamviewer', 'ultraviewer', 'share your screen', 'read me the code', 'read the code back', 'give me the code', 'the verification code we sent', 'one-time code', 'one time passcode', 'otp'];
const BEC = ['i am in a meeting', "i'm in a meeting", 'in a meeting right now', 'cannot talk right now', "can't talk right now", "can't take calls", 'cannot take calls', 'i need you to handle', 'i need this done', 'need this done today', 'need this handled', 'handle this discreetly', 'discreetly', 'urgent request', 'urgent wire', 'urgent payment', 'change of bank details', 'new bank details', 'updated bank details', 'updated banking information', 'our bank account has changed', 'please update the account', 'send to this account instead', 'kindly', 'kindly process', 'kindly send', 'kindly confirm', 'do the needful', 'are you at your desk', 'are you available', 'i need a favor', 'i need a favour', 'purchase some gift cards', 'buy some gift cards', 'scratch the back', 'send me the codes', 'send me the numbers on the back', 'confidential acquisition', 'confidential transaction', 'do not copy anyone', 'do not cc', "don't cc", 'only you can', 'i am counting on you', "i'm counting on you", 'i trust you with this'];
const ROMANCE = ["i've never felt this way", 'i have never felt this way', 'never felt this way about anyone', 'you are my soulmate', "you're my soulmate", 'my soulmate', 'we are meant to be', "we're meant to be", 'meant to be together', 'love at first sight', 'i knew from the moment', 'the moment i saw your profile', 'i want to spend the rest of my life', 'rest of my life with you', 'i cannot stop thinking about you', "i can't stop thinking about you", 'my love', 'my darling', 'my queen', 'my king', 'my dear', 'my future wife', 'my future husband', 'i am stuck at', "i'm stuck at", 'stuck overseas', 'on an oil rig', 'deployed overseas', 'stationed overseas', 'in the military overseas', 'my flight', 'plane ticket', 'i need money for', 'need money to', 'send me money', 'help me with money', 'a small loan', 'medical emergency', 'hospital bills', 'customs are holding', 'my account is frozen', 'my bank is frozen', 'my card was blocked', 'i will pay you back', "i'll pay you back", 'trust me', 'you have to trust me', 'do you trust me', "don't you trust me", 'if you trust me', 'investment platform', 'trading platform', 'crypto platform', 'my uncle works at', 'my mentor', 'guaranteed returns', 'guaranteed profit', 'guaranteed income', 'i made a lot of money', 'i can teach you', 'let me show you how'];
const INVESTMENT_HYPE = ['guaranteed returns', 'guaranteed profit', 'guaranteed income', 'guaranteed monthly', 'risk-free investment', 'risk free investment', 'no risk investment', 'cannot lose', "can't lose", 'double your money', 'triple your money', '10x your', 'to the moon', 'next bitcoin', 'the next amazon', 'get in before', 'get in early', 'ground floor', 'insider information', 'insider tip', 'inside information', 'once-in-a-generation', 'secret strategy', 'the strategy they don\'t want', 'passive income', 'financial freedom', 'be your own boss', 'fire your boss', 'quit your 9-5', 'quit your 9 to 5', 'escape the 9-5', 'six figures', 'seven figures', 'six-figure', 'seven-figure', 'work from anywhere', 'laptop lifestyle', 'time freedom', 'join my team', 'join the movement', 'dm me for details', 'dm me', 'link in bio', 'ask me how', 'serious inquiries only', 'not a pyramid scheme', "it's not a pyramid scheme", 'not an mlm', 'ground-floor opportunity', 'limited spots in my', 'my mentor', 'my coach', 'mastermind', 'exclusive community', 'inner circle', 'this is not financial advice', 'not financial advice'];
const CLICKBAIT = ["you won't believe", 'you will not believe', "you'll never guess", 'you will never guess', 'what happened next', 'what happens next', 'the one thing', 'one weird trick', 'one simple trick', 'this one trick', 'doctors hate', 'banks hate', 'they hate this', 'number 7 will', 'number 3 will', 'will shock you', 'will blow your mind', 'blow your mind', 'mind-blowing', 'mind blowing', 'jaw-dropping', 'jaw dropping', 'the truth about', 'the real reason', 'the shocking truth', 'the hidden truth', 'nobody is talking about', 'no one is talking about', 'nobody talks about', 'what they are not telling you', "what they're not telling you", 'gone viral', 'breaks the internet', 'broke the internet', 'wait for it', 'watch till the end', 'watch until the end', 'you need to see this', 'you have to see this', 'this changes everything', 'game changer', 'game-changer', 'life-changing', 'life changing'];
const ENGAGEMENT_BAIT = ['like if you agree', 'like this if', 'share if you agree', 'share this if', 'retweet if', 'repost if', 'comment yes', 'comment below if', 'type yes', 'type amen', 'say amen', 'tag someone who', 'tag a friend who', 'tag 3 friends', 'tag three friends', '99% of people', '99% will fail', '99% cannot', "99% can't", 'only 1% can', 'only geniuses', 'only a genius', 'most people cannot', "most people can't", 'most people fail', 'share before', 'share this before', 'scroll past this', "don't scroll past", 'do not scroll past', 'keep scrolling if', 'ignore if you', 'i bet you', 'bet you cannot', "bet you can't", 'double tap if', 'smash that like', 'hit that like', 'follow for more', 'follow me for'];
const SOCIAL_PROOF = ['join thousands', 'join millions', 'thousands have already', 'millions of people', 'millions of customers', 'over 10,000', 'over 100,000', 'over 1 million', 'trusted by', 'as seen on', 'as featured in', 'recommended by', 'best-selling', 'best seller', 'bestseller', 'most popular', '#1 rated', 'number one rated', 'top rated', 'five-star', '5-star', 'everyone is switching', 'everybody is switching', 'everyone is using', 'everyone has already', 'your neighbors are', 'your colleagues are', 'your competitors are', 'people like you are', "don't be the only one", 'be the only one left', 'all your friends', 'nine out of ten', '9 out of 10', '9 in 10', 'four out of five', '4 out of 5'];
const AUTHORITY_CUES = ['as a doctor', 'as a physician', 'as a scientist', 'as an expert', 'as a lawyer', 'as an attorney', 'as a former', 'as someone with 20 years', 'with over 20 years', 'with decades of experience', 'award-winning', 'award winning', 'nobel', 'harvard', 'stanford', 'mit researchers', 'government-approved', 'government approved', 'fda approved', 'fda-approved', 'officially recognized', 'officially certified', 'certified expert', 'leading authority', 'world-renowned', 'world renowned', 'top expert', 'the experts at', 'endorsed by', 'backed by science', 'science-backed', 'science backed', 'evidence-based', 'lab-tested', 'lab tested', 'doctor-recommended', 'doctor recommended', 'dentist-recommended', 'dentist recommended', 'trust me, i am', "trust me, i'm", 'i am a professional', "i'm a professional", 'in my professional opinion', 'take it from me'];
const EUPHEMISM = ['collateral damage', 'enhanced interrogation', 'enhanced interrogation techniques', 'kinetic action', 'kinetic military action', 'neutralize', 'neutralized', 'pacification', 'regime change', 'ethnic cleansing', 'servicing the target', 'friendly fire', 'strategic withdrawal', 'downsizing', 'rightsizing', 'right-sizing', 'workforce optimization', 'workforce reduction', 'headcount reduction', 'reduction in force', 'letting you go', 'let go', 'parting ways', 'transitioned out', 'restructuring', 'realignment', 'streamlining', 'operational efficiencies', 'revenue enhancement', 'negative growth', 'negative patient outcome', 'alternative facts', 'economically disadvantaged', 'differently abled', 'pre-owned', 'pre-loved', 'correctional facility', 'adult entertainment', 'sanitation engineer', 'passed away', 'no longer with us', 'disposition of the matter', 'we made a business decision', 'a business decision was made', 'an incident occurred', 'an event occurred', 'unfortunate events'];
const APPEAL_TRADITION = ['we have always done it this way', "we've always done it this way", 'the way it has always been', "the way it's always been", 'that is how it has always been done', 'tradition dictates', 'time-honored', 'time honored', 'our ancestors', 'our forefathers', 'the founders intended', 'as it was in the beginning', 'if it was good enough for', 'it worked for my parents', 'it worked for my grandparents', 'back in my day', 'in the good old days', 'the good old days'];
const APPEAL_NATURE = ['it is only natural', "it's only natural", 'all natural', 'all-natural', '100% natural', 'nature intended', 'as nature intended', 'the natural way', 'the natural order', 'against nature', 'unnatural', 'not how god intended', 'not how nature intended', 'chemical-free', 'chemical free', 'no chemicals', 'toxin-free', 'toxin free', 'detox', 'cleanse your body', 'ancient wisdom', 'ancient remedy', 'ancient secret', 'what big pharma', 'natural cure', 'natural cures'];
const BANDWAGON_ARG = ['everyone knows that', 'everybody knows that', 'everyone agrees', 'everybody agrees', 'everyone is saying', 'everybody is saying', 'nobody believes', 'no one believes', 'nobody thinks', 'no one thinks', 'most people think', 'most people believe', 'most people agree', 'the majority of people', 'the whole world knows', 'the whole world agrees', 'everyone can see', 'anyone can see', 'any reasonable person can see', 'it is obvious to everyone', "it's obvious to everyone"];
// ─────────────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────────────
const DETECTOR_RULES = [
    // ── Pressure ──
    { id: 'urgency', techniqueId: 'artificial-time-pressure', name: 'Manufactured urgency', bucket: 'pressure', harmClass: 'dual-use', weight: 0.8, patterns: [ph(URGENCY)], explanation: 'Deadlines shorten deliberation. Real deadlines exist; the tell is a deadline with no stated reason, or one that resets.', defense: 'Ask what the deadline is for. If the answer is only "so you decide now", the deadline is the technique. Decide what you would do with a week to think, then do that.', contextual: true },
    { id: 'scarcity', techniqueId: 'scarcity', name: 'Scarcity signals', bucket: 'pressure', harmClass: 'dual-use', weight: 0.7, patterns: [ph(SCARCITY)], explanation: 'People assign more value to things that seem rare. Fake stock counters and "others are viewing" widgets manufacture the feeling without the fact.', defense: 'Check whether the "limited" offer has been running for weeks. Decide what you would pay without the pressure, then stick to it.', contextual: true },
    { id: 'fomo', techniqueId: 'fomo', name: 'Fear of missing out', bucket: 'pressure', harmClass: 'dual-use', weight: 0.7, patterns: [ph(FOMO)], explanation: 'Exclusion anxiety pushes action before evaluation. The question being avoided is whether the thing is worth having at all.', defense: 'Name the feeling ("this is FOMO"), then ask what you actually lose by waiting a day. Usually nothing.' },
    { id: 'loss-framing', techniqueId: 'loss-aversion', name: 'Loss framing', bucket: 'pressure', harmClass: 'dual-use', weight: 0.5, patterns: [/\b(?:will|would|could|going to) (?:cost|be|pay)\s+(?:you\s+)?(?:\d+%|\d+ percent|twice as much|double|a lot|much|far|significantly|considerably)\s+more\b/gi, /\b(?:pay more later|cost you more later|the price will (?:go up|rise|increase|double)|prices will (?:go up|rise|increase|double)|you(?:'ll| will) (?:lose|forfeit|miss) (?:your|the|this)|don't lose (?:your|the)|do not lose (?:your|the)|lose (?:your|the) (?:discount|rate|savings|spot|place|access|benefits|bonus))\b/gi], explanation: 'The offer is framed as a loss avoided rather than a gain obtained. Losses loom about twice as large as equivalent gains (prospect theory), so the frame moves people even when the arithmetic is identical.', defense: 'Restate the offer as a gain ("if I act, I get X") and see whether it still seems worth it. Then ask whether the "loss" is real or manufactured for the deadline.', contextual: true },
    { id: 'exclamation-pressure', techniqueId: 'emotional-flooding', name: 'Exclamation-heavy delivery', bucket: 'pressure', harmClass: 'dual-use', weight: 0.35, patterns: [/(!{2,}|(?:\S+\s+){0,6}\S+!\s+(?:\S+\s+){0,6}\S+!\s+(?:\S+\s+){0,6}\S+!)/g], explanation: 'Dense exclamation marks raise arousal and signal that the writer wants a reaction rather than a judgment.', defense: 'Read it once more in a flat voice. If the argument disappears with the punctuation, there was no argument.', contextual: true, minMatches: 1 },
    { id: 'shouting', techniqueId: 'attention-hijacking', name: 'ALL-CAPS emphasis', bucket: 'pressure', harmClass: 'dual-use', weight: 0.35, patterns: [/\b[A-Z]{4,}(?:\s+[A-Z]{3,}){1,}\b/g], explanation: 'Capitals hijack attention and imitate shouting; they are a signal of intensity, not of evidence.', defense: 'Treat capitals as volume, not content. Ask what the claim is when whispered.', contextual: true },
    // ── Emotion ──
    { id: 'loaded-outrage', techniqueId: 'loaded-language', name: 'Outrage-loaded language', bucket: 'emotion', harmClass: 'dual-use', weight: 0.7, patterns: [ph(LOADED_OUTRAGE)], explanation: 'Charged words deliver a verdict before the facts arrive. Outrage narrows attention and increases certainty, which is why it spreads.', defense: 'Strip the adjectives and restate the claim in neutral words. Then ask whether the neutral version is supported.' },
    { id: 'fear-appeal', techniqueId: 'appeal-to-fear', name: 'Fear appeal', bucket: 'emotion', harmClass: 'dual-use', weight: 0.9, patterns: [ph(FEAR), /\bif (?:we|you) (?:don't|do not|fail to|refuse to)\b[^.!?\n]{0,60}\b(?:will|going to|gonna)\b[^.!?\n]{0,40}\b(?:die|suffer|lose|destroy|collapse|end|disappear|be gone|be too late)\b/gi], explanation: 'Fear is legitimate when the threat is real and a workable action is offered (Witte\'s EPPM). Fear without an efficacy path, or a threat inflated beyond the evidence, is manipulation.', defense: 'Ask two questions: how likely is this really (base rate), and does the proposed action actually reduce the risk? If either answer is missing, the fear is doing the work.' },
    { id: 'pity', techniqueId: 'appeal-to-pity', name: 'Pity appeal', bucket: 'emotion', harmClass: 'dual-use', weight: 0.6, patterns: [ph(PITY)], explanation: 'Compassion is invoked to settle a question that compassion does not answer. Real hardship deserves help; it does not settle who is right or what is owed.', defense: 'Separate the two questions: "Do I want to help this person?" and "Is the claim true / is the request reasonable?" Answer them independently.' },
    { id: 'flattery', techniqueId: 'flattery-ingratiation', name: 'Instrumental flattery', bucket: 'emotion', harmClass: 'dual-use', weight: 0.6, patterns: [ph(FLATTERY)], explanation: 'Praise calibrated to your self-image lowers your guard immediately before a request. The compliment is the setup; watch what follows it.', defense: 'Notice praise that arrives right before an ask. Thank them, then evaluate the ask as if a stranger had made it.' },
    { id: 'glittering', techniqueId: 'glittering-generalities', name: 'Glittering generalities', bucket: 'emotion', harmClass: 'manipulative', weight: 0.4, patterns: [ph(GLITTERING)], explanation: 'Virtue words (freedom, values, real change) evoke approval while committing the speaker to nothing specific. The audience supplies the meaning.', defense: 'Ask "what specifically would this look like in practice, for whom, at what cost?" If the answer is another virtue word, there is no proposal.', contextual: true, minMatches: 2 },
    // ── Authority & social proof ──
    { id: 'unnamed-authority', techniqueId: 'weasel-words', name: 'Unattributed authority', bucket: 'authority-proof', harmClass: 'manipulative', weight: 0.7, patterns: [ph(['experts say', 'experts agree', 'experts warn', 'experts believe', 'many experts', 'scientists say', 'scientists agree', 'scientists have shown', 'doctors recommend', 'doctors agree', 'doctors say', 'studies show', 'studies prove', 'studies have shown', 'research shows', 'research proves', 'research has shown', 'statistics show', 'data shows', 'the data shows', 'a recent study', 'a new study', 'according to experts', 'according to research', 'according to studies', 'according to scientists', 'it is scientifically proven', 'scientifically proven', 'clinically proven', 'clinically tested'])], explanation: 'Authority is borrowed from unnamed experts or unnamed studies. Without a name, a date, and a link, it is not evidence — it is the costume of evidence.', defense: 'Ask "which experts, which study, where can I read it?" A real claim survives the question; a borrowed one changes the subject.' },
    { id: 'authority-cues', techniqueId: 'authority', name: 'Authority cues', bucket: 'authority-proof', harmClass: 'dual-use', weight: 0.5, patterns: [ph(AUTHORITY_CUES)], explanation: 'Credentials and institutional names lend weight. They are legitimate when relevant and checkable; a tell is a credential from an unrelated field, or one used to end inquiry.', defense: 'Ask whether the credential is relevant to this specific claim, and verify it independently. Authority is a reason to listen, not a reason to stop checking.', contextual: true },
    { id: 'social-proof', techniqueId: 'social-proof', name: 'Social proof claims', bucket: 'authority-proof', harmClass: 'dual-use', weight: 0.6, patterns: [ph(SOCIAL_PROOF), /\b(?:over|more than|nearly|almost|join(?:ed)? (?:the )?)\s*\d[\d,]*\+?\s+(?:people|customers|companies|businesses|users|members|families|professionals|students|subscribers|readers|patients|clients|teams|organizations|organisations|investors)\b/gi, /\b\d[\d,]*\+?\s+(?:people|customers|companies|businesses|users|members|families|professionals|clients|teams|organizations|organisations|investors)\s+(?:have|already|switched|joined|signed up|trust|use|chose|made the switch|can't be wrong|cannot be wrong)\b/gi], explanation: 'Under uncertainty we do what others do. The numbers may be real; the question is whether they are verifiable and whether popularity is evidence for the actual claim.', defense: 'Evaluate the thing on its merits. Look for verified, detailed reviews rather than aggregate counts, and ask whether the crowd shares your situation.', contextual: true },
    { id: 'bandwagon-argument', techniqueId: 'bandwagon-effect', name: 'Bandwagon argument', bucket: 'authority-proof', harmClass: 'manipulative', weight: 0.6, patterns: [ph(BANDWAGON_ARG)], explanation: '"Everyone knows" substitutes consensus for evidence, and shames disagreement. Real consensus can be cited; invented consensus cannot.', defense: 'Ask who, specifically, and how they know. Then evaluate the claim as if you were the only one who had heard it.' },
    { id: 'testimonial-cue', techniqueId: 'testimonial-engineering', name: 'Testimonial framing', bucket: 'authority-proof', harmClass: 'dual-use', weight: 0.4, patterns: [/\b(?:changed my life|saved my life|i was skeptical at first|i was a skeptic|i never write reviews|i don't usually write reviews|i do not usually write reviews|as a (?:mom|mother|dad|father|nurse|teacher|veteran|lifelong)\b[^.!?\n]{0,40}\bi (?:can|have to|must) (?:say|tell you|recommend))\b/gi], explanation: 'Testimonials are chosen and often shaped. "I never write reviews, but…" and "as a mother, I…" are stock openings of engineered or sponsored testimony.', defense: 'Weigh testimonials at zero unless verifiable. Look for the base rate: how many people tried it and did not write a testimonial?', contextual: true },
    // ── Fallacies (structural) ──
    { id: 'false-dichotomy', techniqueId: 'false-dichotomy', name: 'False dichotomy', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.9, patterns: [/\b(?:you(?:'re| are) either|either you)\b[^.!?\n]{1,60}\bor\b/gi, /\beither (?:we|you|they|it|this|that|there|our|your)\b[^.!?\n]{1,80},? or\b/gi, /\bthe choice (?:is|before us is|before you is|could not be more) (?:simple|clear|binary|stark|obvious|yours)\b/gi, /\b(?:stand|are you|you(?:'re| are)) with us,? or (?:with|against|stand with)\b/gi, /\bthere is no (?:middle ground|third way|third option|in-between|compromise here)\b/gi, /\b(?:we|you|they) (?:must|can|have to) (?:either )?(?:choose|decide|pick)\b[^.!?\n]{0,20}\b(?:between )?(?:\w+ ){0,4}\bor\b[^.!?\n]{0,30}\b(?:nothing|die|lose|perish|fall)\b/gi, /\bthere (?:are|is) (?:only )?two (?:choices|options|ways|kinds|sides|paths)\b/gi, /\byou (?:can|must|have to) (?:only )?(?:choose|pick|decide)\b[^.!?\n]{0,30}\b(?:one or the other|between)\b/gi, /\b(?:the only (?:choice|option|alternative|way) is|there is no (?:other|third) (?:option|way|choice)|no middle ground|it's (?:this|us|now) or|it is (?:this|us|now) or)\b/gi, /\bif you(?:'re| are) not (?:with|for|part of)\b[^.!?\n]{0,30}\byou(?:'re| are) (?:against|with the|part of the problem)\b/gi], explanation: 'Two options are presented as if they exhaust the possibilities. The frame does the persuading by hiding the alternatives.', defense: 'Ask "is there a third option?" and name one, even a bad one. The frame collapses as soon as a third option is on the table.' },
    { id: 'slippery-slope', techniqueId: 'slippery-slope', name: 'Slippery slope', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.8, patterns: [/\b(?:next thing you know|before you know it|where (?:does|will) it (?:end|stop)|what(?:'s| is) next\??|this (?:will|is going to) lead to|open(?:s|ing)? the (?:door|floodgates) to|slippery slope|first they|if we (?:allow|let|permit) (?:this|that|them)\b[^.!?\n]{0,60}\b(?:then|next|soon|eventually|before long))\b/gi], explanation: 'A modest step is linked to a catastrophe through a chain whose links are never shown. Valid versions exist — when each link is argued. The tell is the missing mechanism.', defense: 'Ask "which step, specifically, and what makes it inevitable?" Make them argue the chain link by link.' },
    { id: 'straw-man', techniqueId: 'straw-man', name: 'Straw man', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.8, patterns: [/\bso (?:what )?you(?:'re| are) (?:really )?saying (?:is )?\b/gi, /\bin other words,? you (?:think|believe|want|mean)\b/gi, /\bthat(?:'s| is) like saying\b/gi, /\bso you (?:want|think|believe|admit)\b[^.!?\n]{0,40}\b(?:everyone|nobody|all|none|every|no one)\b/gi, /\b(?:they|the other side|the left|the right|liberals|conservatives|democrats|republicans) (?:want|wants) to (?:ban all|take away all|destroy|abolish|eliminate) (?:your|our|the)\b/gi], explanation: 'The position is restated in a weaker or more extreme form and the restatement is attacked. The audience remembers the caricature.', defense: 'Restate your actual claim in one sentence and ask them to respond to that one. Refuse to defend the version you did not say.' },
    { id: 'ad-hominem', techniqueId: 'ad-hominem', name: 'Ad hominem', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.8, patterns: [/\b(?:what (?:do|would) you know|consider the source|of course (?:he|she|they)(?:'d| would) say that|typical (?:\w+ ){0,2}(?:supporter|voter|believer|fan|liberal|conservative|boomer|millennial)|people like you (?:always|never|just|are)|you(?:'re| are) (?:just|only|nothing but) a\b|you(?:'re| are) too (?:stupid|dumb|young|old|naive|emotional) to)\b/gi, /\b(?:you|he|she|they)(?:'re| are|'s| is) (?:a |an |such a |just a |nothing but a )?(?:idiot|moron|imbecile|loser|fool|clown|hypocrite|liar|fraud|coward|snowflake|bootlicker|shill|sheep|sheeple|degenerate|scum|trash|garbage)\b/gi], explanation: 'The person is attacked instead of the argument. Even an accurate insult says nothing about whether the claim is true.', defense: 'Say "that may be, and the claim is still on the table — what is wrong with it?" Return to the argument every time.' },
    { id: 'whataboutism', techniqueId: 'whataboutism', name: 'Whataboutism / tu quoque', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.7, patterns: [/\b(?:but )?what about (?:the|when|all the|your|his|her|their)\b/gi, /\b(?:you(?:'re| are) one to talk|look who(?:'s| is) talking|pot calling the kettle|you do it too|you did the same|you(?:'ve| have) done worse|and yet you|the real (?:issue|problem|scandal|question) is)\b/gi], explanation: 'Criticism is deflected by pointing at someone else\'s wrongdoing. Two wrongs do not answer the first one.', defense: 'Note it and return: "We can talk about that next. Right now the question is X." Do not follow the redirect.' },
    { id: 'appeal-to-tradition', techniqueId: 'appeal-to-tradition', name: 'Appeal to tradition', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.5, patterns: [ph(APPEAL_TRADITION)], explanation: 'Age is offered as evidence of correctness. Traditions can encode wisdom; the argument still has to say what the wisdom is.', defense: 'Ask "what is the reason the tradition exists, and does that reason still hold?" Longevity is a prompt to investigate, not a conclusion.', contextual: true },
    { id: 'appeal-to-nature', techniqueId: 'appeal-to-nature', name: 'Appeal to nature', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.5, patterns: [ph(APPEAL_NATURE)], explanation: '"Natural" is used as a synonym for safe or good. Arsenic and hemlock are natural; vaccines and seat belts are not.', defense: 'Ask for evidence of safety and effectiveness, not origin. "Natural" is a marketing word until a study is attached to it.', contextual: true },
    { id: 'appeal-to-ignorance', techniqueId: 'appeal-to-ignorance', name: 'Appeal to ignorance / burden shift', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.7, patterns: [/\b(?:you can(?:'t|not) prove (?:it|that)(?:'s| is)? (?:not|false|wrong)|no one has (?:ever )?(?:proven|proved|disproven|disproved)|nobody has (?:ever )?(?:proven|proved|disproven|disproved)|there(?:'s| is) no (?:evidence|proof) (?:that it (?:isn't|is not|didn't|did not)|against)|absence of evidence|until (?:you|someone) can prove|prove me wrong|prove (?:it|that) (?:isn't|is not|didn't|did not)|the burden (?:of proof )?is on you|show me (?:where|proof that|evidence that) (?:it|that) (?:isn't|is not|didn't|did not))\b/gi], explanation: 'A claim is treated as true because it has not been disproven, or the burden of proof is pushed onto the doubter. The person asserting owes the evidence.', defense: 'Say "you made the claim; what is the evidence for it?" and hold the line. Not having disproved something is not a reason to believe it.' },
    { id: 'circular', techniqueId: 'circular-reasoning', name: 'Circular reasoning', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.6, patterns: [/\b(?:because (?:i|we|they) said so|it(?:'s| is) true because (?:it|i|we|they|he|she)|the reason is because it is|it(?:'s| is) obvious(?:ly)? (?:true|right|correct)|everyone knows it(?:'s| is) true|it is what it is because|that(?:'s| is) just the way it is because)\b/gi], explanation: 'The conclusion is smuggled into the premise. Nothing has been argued; the claim has only been repeated with "because" in front of it.', defense: 'Ask for a reason that does not assume the conclusion. "Because it is" is not one.' },
    { id: 'hasty-generalization', techniqueId: 'hasty-generalization', name: 'Sweeping generalization', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.7, patterns: [/\b(?:all|every single|every one of) (?:\w+ ){0,2}(?:men|women|cops|police|politicians|lawyers|doctors|teachers|journalists|bankers|landlords|immigrants|migrants|foreigners|refugees|muslims|christians|jews|catholics|atheists|liberals|conservatives|democrats|republicans|boomers|millennials|gen z|zoomers|rich people|poor people|white people|black people|asians|asian people|latinos|hispanics|gay people|trans people|feminists|men|women) (?:are|is|do|does|want|wants|think|thinks|hate|hates|lie|lies|cheat|cheats)\b/gi, /\b(?:they|those people|these people|women|men|kids today|young people|old people) (?:are all|all (?:want|think|do|lie)|are just|are nothing but)\b/gi], explanation: 'A trait is asserted of an entire group. The claim is unfalsifiable in practice and does the work of prejudice under the appearance of observation.', defense: 'Ask "all of them? how many did you check?" and notice whether the answer is a sample or a feeling.' },
    { id: 'no-true-scotsman', techniqueId: 'no-true-scotsman', name: 'No true Scotsman', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.6, patterns: [/\bno (?:real|true|genuine) (?:american|christian|muslim|jew|patriot|man|woman|conservative|liberal|feminist|believer|supporter|fan|scientist|leftist|socialist|libertarian|\w+ist)\b/gi, /\ba (?:real|true) (?:\w+ )?(?:would|wouldn't|would not|never|always)\b/gi, /\bany (?:true|real) (?:\w+ )?(?:knows|would|should|understands)\b/gi], explanation: 'Counterexamples are dismissed by redefining the group. The definition moves to protect the claim.', defense: 'Ask them to define the group before you discuss members. If the definition is "someone who agrees with me", the claim is empty.' },
    { id: 'loaded-question', techniqueId: 'loaded-questions', name: 'Loaded question', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.7, patterns: [/\b(?:why (?:do|did|are|have) you (?:always|keep|still|never|constantly|insist on)|why (?:are|were) you (?:so|being so|such)|have you (?:finally )?stopped|when (?:are|will) you (?:finally |going to )?(?:admit|stop|realize|accept)|isn't it true that you|is it true that you (?:still|always|never))\b/gi], explanation: 'The question contains an assumption the answerer has not accepted. Any direct answer concedes it.', defense: 'Refuse the premise before answering: "That question assumes X, and I do not accept X." Then answer only the real question, if there is one.' },
    { id: 'post-hoc', techniqueId: 'post-hoc-ergo-propter-hoc', name: 'Post hoc / false cause', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.5, patterns: [/\b(?:ever since (?:they|he|she|we|you|the|that)\b[^.!?\n]{0,50}\b(?:it|things|everything|crime|prices|nothing) (?:has|have) (?:been|gone|gotten|got)|right after (?:they|he|she|the)\b[^.!?\n]{0,40}\b(?:started|began|happened|came)|(?:just a |not a |no )?coincidence\??|and (?:then|suddenly) (?:everything|it all) (?:changed|went|started))\b/gi], explanation: 'Sequence is offered as cause. Things that happen after other things usually have other causes.', defense: 'Ask "what else changed at the same time, and would this have happened anyway?" Correlation needs a mechanism before it is a cause.', contextual: true },
    { id: 'kafka-trap', techniqueId: 'kafka-trap', name: 'Kafka trap', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.9, patterns: [/\b(?:your denial (?:proves|confirms|shows|is proof)|the fact that you deny it|denying it (?:proves|confirms|just proves)|only a (?:\w+ ){0,2}would deny|if you (?:weren't|were not) (?:guilty|one of them|a \w+),? you (?:wouldn't|would not)|that(?:'s| is) exactly what a (?:\w+ ){0,2}would say|of course you(?:'d| would) say that|getting defensive (?:proves|shows|means))\b/gi], explanation: 'Denial is treated as evidence of guilt, making the accusation unfalsifiable. There is no answer that counts as innocence.', defense: 'Ask "what evidence would show I am not?" If nothing could, the accusation is not a claim; it is a trap. Decline to play.' },
    { id: 'thought-terminating', techniqueId: 'thought-terminating-cliche', name: 'Thought-terminating cliché', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.5, patterns: [ph(THOUGHT_TERMINATING)], explanation: 'A stock phrase ends inquiry without answering it. Lifton called this "loading the language": complex questions compressed into slogans.', defense: 'Answer the cliché with the question it dodged: "Which part, specifically? Why is it that way?"', contextual: true },
    { id: 'question-burst', techniqueId: 'gish-gallop', name: 'Rapid-fire questioning', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.5, patterns: [/(?:[^?\n]{3,120}\?\s*){3,}/g], explanation: 'A burst of questions faster than any could be answered. In debate this is the Gish gallop; online it is often sealioning ("just asking questions"). The goal is to exhaust, not to learn.', defense: 'Pick the strongest single question and answer only that one, well. Say so out loud: "I will take these one at a time, starting with the one that matters most."', contextual: true },
    { id: 'jaq', techniqueId: 'just-asking-questions', name: 'Just-asking-questions framing', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.6, patterns: [ph(["i'm just asking questions", 'i am just asking questions', 'just asking questions', 'i\'m only asking', 'just asking', "i'm just curious why", 'i am just curious why', 'why won\'t anyone answer', 'why will no one answer', "why won't you answer", 'why is no one allowed to ask', 'we\'re not allowed to ask', 'you can\'t even ask', "you're not allowed to ask", 'i\'m just saying', 'i am just saying', 'all i\'m saying is', 'all i am saying is', 'makes you think', 'just something to think about', 'food for thought', 'i\'ll leave it there', "i'll just leave this here", 'i will just leave this here', 'draw your own conclusions', 'you decide', 'i\'m not saying it\'s true, but', 'i am not saying it is true, but', "not saying it's true", 'people should look into'])], explanation: 'An insinuation is delivered as a question so that the speaker can deny having claimed anything. The audience supplies the accusation.', defense: 'Convert the question into the claim it implies and ask them to defend that: "You seem to be saying X. Is that your claim, and what is the evidence?"', contextual: true },
    { id: 'concern-troll', techniqueId: 'concern-trolling', name: 'Concern-trolling frame', bucket: 'fallacy', harmClass: 'manipulative', weight: 0.6, patterns: [/\b(?:as (?:a|an) (?:lifelong|longtime|long-time|former|loyal|dedicated) (?:\w+ ){0,3}(?:supporter|voter|member|fan|democrat|republican|liberal|conservative|customer|employee)|i say this as (?:a|an|someone who)|i(?:'m| am) on your side,? but|i (?:support|agree with) (?:you|the cause|the goal),? but|i(?:'m| am) (?:just |genuinely |honestly )?(?:worried|concerned) (?:that|about how) (?:this|you|it) (?:will|might|could|looks|makes)|i(?:'m| am) only saying this because i care|for your own good|i(?:'ve| have) never posted (?:here )?before,? but)\b/gi], explanation: 'Opposition is dressed as friendly concern, often from a claimed insider identity, to undermine from within while resisting the label of opponent.', defense: 'Take the concern literally and ask for the specific alternative they would support. Real allies have one; concern trolls have only the concern.' },
    // ── Propaganda & othering ──
    { id: 'us-them', techniqueId: 'in-group-out-group-bias', name: 'Us-versus-them framing', bucket: 'propaganda', harmClass: 'dual-use', weight: 0.8, patterns: [ph(US_THEM), /\b(?:they|them)\b[^.!?\n]{0,40}\b(?:hate (?:us|you|everything we)|want to (?:destroy|take|silence|replace|erase|end) (?:us|you|our)|are (?:coming|out) (?:for|to get) (?:us|you)|will (?:never|always)\b)/gi], explanation: 'A group is defined by opposition to another group. Belonging is offered in exchange for hostility, and dissent starts to look like betrayal.', defense: 'Ask what "they" actually said or did, in their own words, and whether "they" are one group or many. Othering survives only in the abstract.' },
    { id: 'dehumanization', techniqueId: 'dehumanization', name: 'Dehumanizing language', bucket: 'propaganda', harmClass: 'manipulative', weight: 1.4, patterns: [ph(DEHUMANIZATION)], explanation: 'People are equated with vermin, disease, or contamination. Stanton lists dehumanization as the stage at which ordinary revulsion against violence is overcome; the language is detectable long before the violence.', defense: 'Name it out loud: "that is dehumanizing language." Refuse the metaphor and insist on people, with names and reasons.' },
    { id: 'violence-rhetoric', techniqueId: 'appeal-to-force', name: 'Threat or eliminationist rhetoric', bucket: 'coercion', harmClass: 'manipulative', weight: 1.5, patterns: [ph(VIOLENCE)], explanation: 'Harm — physical, reputational, or legal — is promised or hinted at to compel. This is argumentum ad baculum: force offered where a reason should be.', defense: 'Do not negotiate with a threat. Preserve the message, tell someone you trust, and if there is any risk to safety contact local authorities. Threats to expose or ruin are also crimes in many places.' },
    { id: 'conspiracy-frame', techniqueId: 'conspiracy-rhetoric', name: 'Conspiracy frame', bucket: 'propaganda', harmClass: 'manipulative', weight: 0.7, patterns: [ph(CONSPIRACY)], explanation: 'Hidden actors, suppressed truth, and "do your own research" convert the absence of evidence into evidence of a cover-up. The frame is unfalsifiable by design and flatters the audience as the awakened few.', defense: 'Ask what evidence would change the speaker\'s mind. Then check the claim laterally: search for it, see who else reports it and how. "They are hiding it" is not a source.', contextual: true },
    { id: 'enemy-blame', techniqueId: 'scapegoating', name: 'Scapegoating', bucket: 'propaganda', harmClass: 'manipulative', weight: 0.8, patterns: [/\b(?:it(?:'s| is) (?:all )?(?:their|his|her) fault|(?:they|he|she|the \w+s) (?:are|is) (?:the reason|why|to blame for|responsible for) (?:everything|all of this|all our|our problems|the problems|what is wrong|what's wrong)|blame the (?:immigrants|migrants|foreigners|elites|rich|poor|media|jews|muslims|liberals|conservatives|government|boomers|men|women)|everything (?:wrong|bad) (?:in|with) (?:this country|the world|our lives) is because of)\b/gi], explanation: 'One group is made to carry the blame for a complex problem. The relief of having someone to blame substitutes for a cause and a solution.', defense: 'Ask how the accused group could plausibly have produced the whole problem, and what would have to be true for the problem to persist after they were gone.' },
    { id: 'astroturf-tell', techniqueId: 'political-astroturfing', name: 'Astroturf tell', bucket: 'propaganda', harmClass: 'manipulative', weight: 0.5, patterns: [/\b(?:i(?:'ve| have) never (?:posted|commented|written a review|been political) before,? but|i(?:'m| am) not (?:usually )?political,? but|i (?:used to|always) (?:vote|support) (?:\w+ ){0,3}(?:but|until)|as a (?:lifelong|longtime|proud) (?:\w+ ){0,2}(?:i|we) (?:am|are) (?:switching|leaving|done|voting))\b/gi], explanation: 'A stock "I am not the type to say this, but…" opening claims independence it may not have. Coordinated campaigns favor this frame because it manufactures the appearance of organic conversion.', defense: 'Check the account: age, history, how many near-identical messages exist. One sincere convert is a person; a hundred with the same opening is a campaign.', contextual: true },
    // ── Coercion (structural) ──
    { id: 'conditional-threat', techniqueId: 'appeal-to-force', name: 'Conditional threat (if you don\'t… I will…)', bucket: 'coercion', harmClass: 'manipulative', weight: 1.4, patterns: [/\b(?:if|unless)\s+you\s+(?:(?:don't|do not|won't|will not|refuse|refuse to|fail|fail to|can't|cannot|ever|dare|try|keep|continue|insist)\s+)?[^.!?;\n]{0,80}?[,;]?\s*(?:then\s+)?(?:i|we)\s*(?:'ll|will|won't|will not|am going to|are going to|'m going to|'re going to|can't|cannot|would|could|'d|shall|might have to|will have to|'ll have to)\b[^.!?\n]{0,80}/gi, /\b(?:you (?:will|'ll) (?:regret|be sorry|pay|lose|wish)|there will be consequences|consequences will follow|you leave me no choice|you(?:'ve| have) left me no choice|i(?:'ll| will) have no choice but to|don't say i didn't warn you|do not say i did not warn you|you(?:'ve| have) been warned)\b/gi], explanation: 'A cost is attached to refusal: comply or something bad happens (or something good is withdrawn). This is coercion, not persuasion — no reason is offered why the request is right, only what refusal will cost.', defense: 'Separate the request from the threat and answer each on its own: "Even without the threat, would I do this?" and "Is this threat one I should report or plan around?" Do not let the threat set the terms of the conversation.' },
    { id: 'inducement', techniqueId: 'quid-pro-quo-social-engineering', name: 'Inducement / bribe (pay-then-do)', bucket: 'coercion', harmClass: 'manipulative', weight: 1.2, patterns: [/\b(?:i|we)\s*(?:'ll|will|would|can|could|'d)\s+(?:give|pay|send|offer|get|make|wire|transfer|hand|slip|owe)\s+you\b[^.!?\n]{0,60}?\b(?:if|and then|then|in exchange|in return|once you|as long as|provided|when you|after you|for)\b/gi, /(?:\$|£|€)\s?\d[\d,]*(?:\.\d+)?\s*(?:k|K|m|M|million|thousand|grand)?\b[^.!?\n]{0,60}?\b(?:if you|and then you|then you|in exchange|in return|for your (?:help|cooperation|trouble|silence|vote|support)|to (?:make this go away|look the other way|keep quiet|forget))\b/gi, /\b(?:if|once|when|as soon as)\s+you\b[^.!?\n]{0,60}?\b(?:i|we)\s*(?:'ll|will|'d|would)\s+(?:give|pay|send|reward|make it worth|take care of|look after|hook you up|cut you in)\b/gi, /\b(?:make it worth your while|there(?:'s| is) something in it for you|i(?:'ll| will) make it worth|what(?:'s| is) it worth to you|name your price|everyone has a price|i can make (?:this|that|it) (?:happen|go away|worth))\b/gi], explanation: 'A reward is offered in exchange for a specific act, in place of a reason the act is right. Bribes, kickbacks, and quid-pro-quo offers persuade by changing the payoff, not by informing the judgment.', defense: 'Ask: would I do this if no one were paying me? If the answer is no, the payment is buying something you should not sell. Document the offer; in workplaces and public roles, report it.' },
    { id: 'ultimatum', techniqueId: 'take-it-or-leave-it', name: 'Ultimatum', bucket: 'coercion', harmClass: 'dual-use', weight: 0.9, patterns: [ph(ULTIMATUM)], explanation: 'A choice is forced between total compliance and a stated loss, on a clock. Real final positions exist; the tell is a bluffed finality used to stop legitimate negotiation.', defense: 'Take the time anyway: "I do not make decisions under ultimatums. If it is final, it will still be final tomorrow." Bluffs do not survive a day.' },
    { id: 'reward-withdrawal', techniqueId: 'financial-control', name: 'Reward or support withdrawal', bucket: 'coercion', harmClass: 'manipulative', weight: 0.8, patterns: [/\b(?:i|we)\s*(?:won't|will not|'ll stop|will stop|'m going to stop|am going to stop|'ll cut|will cut|'m not going to|am not going to|'ll no longer|will no longer)\s+(?:be |help|pay|cover|support|give|do|watch|feed|pet|drive|look after|take care of|come to|talk to|speak to|invite|include)\b[^.!?\n]{0,60}?\b(?:next time|anymore|any more|again|from now on|until you|unless you|if you)\b/gi, /\b(?:don't|do not) expect (?:me|us) to\b|\byou can forget (?:about )?\b|\byou (?:won't|will not) be getting\b|\byou get nothing\b|\bsay goodbye to (?:your|the)\b|\bkiss (?:your|the) (?:\w+ ){0,2}goodbye\b/gi], explanation: 'Something the person relies on — help, money, affection, access — is made conditional on compliance. Withdrawal of support is the quieter form of threat.', defense: 'Name the structure: "You are making X conditional on my doing Y." Then decide Y on its merits and plan for X being withdrawn regardless; a relationship that runs on conditional support needs a different conversation.' },
    { id: 'directive', techniqueId: 'embedded-commands', name: 'Directive pressure (you should / you must)', bucket: 'coercion', harmClass: 'dual-use', weight: 0.4, patterns: [/\byou\s+(?:should|must|need to|have to|ought to|had better|have got to|gotta|better)\s+(?!not\b)\w+/gi, /\b(?:just )?(?:do it|sign it|send it|pay it|fire (?:him|her|them)|delete it|trust me and)\b(?:\s+now)?[.!]/gi], explanation: 'The message tells you what to do without giving reasons. Directives are ordinary in instructions; in persuasion, a high density of "you should / you must" signals pressure standing in for argument.', defense: 'Ask "why?" once for each directive. If the reasons do not come, the instruction was the whole message.', contextual: true },
    { id: 'global-criticism', techniqueId: 'shame-spiraling', name: 'Global criticism (you always / you never)', bucket: 'abuse', harmClass: 'manipulative', weight: 0.6, patterns: [/\byou\s+(?:always|never|constantly|only ever)\s+(?!have to|need to|get to|want to)\w+/gi, /\byou(?:'re| are)\s+(?:always|never)\b/gi], explanation: 'A specific complaint is inflated into a character verdict. Gottman identifies this criticism-of-character pattern as corrosive; as a tactic it manufactures guilt and defensiveness in place of a solvable request.', defense: 'Translate the global into the specific: "What happened this time, and what would you like instead?" Refuse to litigate "always".', contextual: true, minMatches: 1 },
    // ── Abuse / control language ──
    { id: 'gaslighting', techniqueId: 'gaslighting', name: 'Reality denial (gaslighting language)', bucket: 'abuse', harmClass: 'abuse', weight: 1.2, patterns: [ph(GASLIGHTING)], explanation: 'Your memory, perception, or feelings are denied outright ("that never happened", "you\'re too sensitive"). One instance is a disagreement; a pattern is an attempt to make you distrust your own judgment.', defense: 'Trust your record over their denial. Write things down where they cannot be reached, and reality-check with someone outside the relationship. If this is a pattern with a partner or family member, a counselor trained in coercive control can help you see it clearly.' },
    { id: 'darvo', techniqueId: 'darvo', name: 'Blame reversal (DARVO)', bucket: 'abuse', harmClass: 'abuse', weight: 1.2, patterns: [ph(DARVO)], explanation: 'Deny, Attack, Reverse Victim and Offender (Freyd): when confronted, the accused denies, attacks the accuser, and claims to be the real victim. The original complaint disappears under the counter-accusation.', defense: 'Keep the original question on the table: "We can discuss how you feel, and I still need an answer about X." Do not defend yourself against the reversal; return to the fact.' },
    { id: 'minimization', techniqueId: 'minimization', name: 'Minimization', bucket: 'abuse', harmClass: 'manipulative', weight: 0.6, patterns: [ph(MINIMIZATION)], explanation: 'The harm is shrunk ("not a big deal", "get over it") so that objecting looks unreasonable. The size of the harm is decided by the person who caused it.', defense: 'State the impact in concrete terms and do not negotiate its size: "It was a big deal to me, and here is what it cost me."', contextual: true },
    { id: 'isolation', techniqueId: 'isolation-tactics', name: 'Isolation and monitoring language', bucket: 'abuse', harmClass: 'abuse', weight: 1.2, patterns: [ph(ISOLATION)], explanation: 'Friends and family are discredited, contact is questioned, and devices are checked. Cutting a person off from outside reality-checks is a core mechanism of coercive control (Stark).', defense: 'Keep your outside relationships and your own accounts and devices. If you are being monitored, do not confront it alone — an advocate can help you plan safely (US: 1-800-799-7233 / thehotline.org).' },
    { id: 'guilt', techniqueId: 'guilt-tripping', name: 'Guilt and obligation', bucket: 'abuse', harmClass: 'manipulative', weight: 0.8, patterns: [ph(GUILT)], explanation: 'Obligation is manufactured from past favors or from what a "good" person would do, so that refusing feels like a moral failure rather than a choice.', defense: 'Separate gratitude from compliance: "I am grateful, and this is still a no." Gifts given to create debt were not gifts.' },
    { id: 'emotional-blackmail', techniqueId: 'emotional-blackmail', name: 'Emotional blackmail', bucket: 'abuse', harmClass: 'abuse', weight: 1.4, patterns: [ph(EMOTIONAL_BLACKMAIL)], explanation: 'Fear, obligation, and guilt (Forward\'s FOG) are combined into a threat about the relationship or the speaker\'s own wellbeing. Self-harm threats used to control are still threats; they are also a reason to involve professionals, not to comply.', defense: 'You are not responsible for choices someone else makes to punish you. If someone threatens to harm themselves, take it seriously by calling a crisis line or emergency services — not by giving in. A domestic-violence advocate can help you plan.' },
    { id: 'love-bombing', techniqueId: 'love-bombing', name: 'Intense early affection', bucket: 'abuse', harmClass: 'abuse', weight: 0.6, patterns: [ph(['soulmate', 'my soulmate', "i've never felt this way", 'i have never felt this way', 'never met anyone like you', "we're meant to be", 'we are meant to be', 'meant for each other', 'you are perfect', "you're perfect", 'the only one who understands me', 'you complete me', 'i knew from the first', 'love of my life', 'i want to marry you', 'move in with me', 'i cannot live without you', "i can't live without you", 'forever and always', 'i would do anything for you', "i'd do anything for you"])], explanation: 'Overwhelming affection and future promises arrive faster than the relationship could have earned them. On its own it is just romance; combined with speed, isolation, or requests for money it is the opening of a control or scam pattern.', defense: 'Slow the tempo and see what happens. Healthy affection tolerates a slower pace; love-bombing punishes it.', contextual: true, minMatches: 2 },
    // ── Deception / evasion ──
    { id: 'weasel', techniqueId: 'weasel-words', name: 'Weasel attribution', bucket: 'deception', harmClass: 'manipulative', weight: 0.5, patterns: [ph(WEASEL.filter((w) => !/^(experts|scientists|doctors|studies|research|statistics|clinically|scientifically)/.test(w)))], explanation: 'A claim is attributed to no one ("some say", "it is believed") or softened until it cannot be false ("up to", "virtually", "helps"). Honest uncertainty names its source; weasel words hide the absence of one.', defense: 'Ask "who, exactly, says so?" and "what is the number without the qualifier?"', contextual: true },
    { id: 'non-denial', techniqueId: 'non-denial-denial', name: 'Non-denial denial / agentless language', bucket: 'deception', harmClass: 'manipulative', weight: 0.7, patterns: [ph(NON_DENIAL)], explanation: 'Words that sound like a denial or an apology without being one: "I don\'t recall", "mistakes were made", "sorry you feel that way". Agency is removed; responsibility goes with it.', defense: 'Ask the yes/no question again in plain words, and insist on a subject for the verb: "Who made the mistake?"', contextual: true },
    { id: 'unearned-certainty', techniqueId: 'proof-by-assertion', name: 'Unearned certainty', bucket: 'deception', harmClass: 'manipulative', weight: 0.5, patterns: [ph(CERTAINTY)], explanation: 'Certainty is asserted instead of earned: "the debate is over", "100% guaranteed", "no reasonable person". Real evidence rarely needs to announce that it cannot be questioned.', defense: 'Treat "undeniable" as a claim requiring more evidence, not less. Ask what the strongest counter-argument is; a person who has one is arguing, a person who has none is selling.', contextual: true },
    { id: 'euphemism', techniqueId: 'euphemism', name: 'Euphemism', bucket: 'deception', harmClass: 'dual-use', weight: 0.5, patterns: [ph(EUPHEMISM)], explanation: 'A harsh reality is renamed so that it produces less feeling and less scrutiny. Kind euphemisms spare feelings without hiding facts; manipulative ones hide the fact.', defense: 'Translate back into plain words and see whether the sentence is still acceptable: "civilians were killed", "people were fired".', contextual: true },
    { id: 'secrecy', techniqueId: 'scam-triad-urgency-authority-secrecy', name: 'Secrecy request', bucket: 'deception', harmClass: 'manipulative', weight: 1.0, patterns: [ph(SECRECY)], explanation: 'You are asked not to tell anyone. Legitimate requests survive a second opinion; scams, grooming, and coercion depend on isolating the decision from anyone who would say "wait".', defense: 'The request for secrecy is itself the signal. Tell someone anyway — a friend, a colleague, the real institution on a number you look up yourself.' },
    // ── Scam & social engineering ──
    { id: 'account-lure', techniqueId: 'phishing', name: 'Account / delivery alert lure', bucket: 'scam', harmClass: 'manipulative', weight: 1.0, patterns: [ph(SCAM_ACCOUNT)], explanation: 'A trusted institution\'s voice is borrowed to create a problem only a click can solve: suspended account, unusual login, undelivered package. The borrowed authority plus the deadline plus the single easy action is the phishing signature.', defense: 'Never act through the link. Open the service by typing its address or using its app, or call the number printed on your card or statement. Real institutions do not mind you checking.' },
    { id: 'prize-lure', techniqueId: 'advance-fee-fraud', name: 'Prize / refund / inheritance lure', bucket: 'scam', harmClass: 'manipulative', weight: 1.0, patterns: [ph(SCAM_PRIZE)], explanation: 'Unexpected money you did not apply for, usually released after a "fee". Advance-fee fraud has run for centuries; the prize is the bait, the fee is the theft.', defense: 'You cannot win a lottery you did not enter, and no real payout requires a fee first. Delete, and if money is involved report it (US: reportfraud.ftc.gov).' },
    { id: 'payment-method', techniqueId: 'gift-cards-mean-scam', name: 'Unusual payment method', bucket: 'scam', harmClass: 'manipulative', weight: 1.3, patterns: [ph(SCAM_PAYMENT)], explanation: 'Gift cards, wire transfers, crypto ATMs, and "safe accounts" are irreversible and untraceable — exactly why scammers insist on them. No government agency, bank, or company collects payment in gift cards.', defense: 'Gift cards and crypto ATMs mean scam, every time. Never "move money to protect it". Hang up, and call the real institution on a number you look up.' },
    { id: 'impersonated-authority', techniqueId: 'authority-impersonation-scam', name: 'Impersonated authority / tech support', bucket: 'scam', harmClass: 'manipulative', weight: 1.1, patterns: [ph(SCAM_AUTHORITY)], explanation: 'A caller or message claims to be tax, police, bank fraud, or tech support, and needs immediate action, a code, or remote access. Government agencies do not call to threaten arrest; tech companies do not call about viruses.', defense: 'Hang up and call back on the official number from the agency\'s or company\'s website. Never share a one-time code — it is the key to your account. Never grant remote access to an unsolicited caller.' },
    { id: 'bec', techniqueId: 'business-email-compromise', name: 'Executive-request / payment-change pattern', bucket: 'scam', harmClass: 'manipulative', weight: 1.0, patterns: [ph(BEC)], explanation: 'An "executive" or "vendor" needs a discreet, urgent payment, gift cards, or a change of bank details, and cannot talk right now. Business email compromise is the costliest fraud category reported to the FBI year after year.', defense: 'Verify any payment change or urgent request by voice on a known number — never by replying. Two-person approval for new bank details is the single most effective control.', contextual: true, minMatches: 2 },
    { id: 'romance-money', techniqueId: 'romance-scam', name: 'Romance-plus-money pattern', bucket: 'scam', harmClass: 'manipulative', weight: 0.9, patterns: [ph(ROMANCE)], explanation: 'Intense affection from someone who cannot meet in person, followed by an emergency, a blocked account, or an investment "opportunity". Romance and pig-butchering scams run for weeks or months before the first ask.', defense: 'Never send money or invest through a platform recommended by someone you have not met in person. Reverse-image-search their photos. Tell a friend about the relationship — secrecy is the scammer\'s ally.', contextual: true, minMatches: 2 },
    { id: 'investment-hype', techniqueId: 'pump-and-dump-hype', name: 'Investment / MLM hype', bucket: 'engagement', harmClass: 'manipulative', weight: 0.8, patterns: [ph(INVESTMENT_HYPE)], explanation: '"Guaranteed returns", "financial freedom", "join my team": the vocabulary of pump-and-dump, MLM recruitment, and trading-platform fraud. Guaranteed returns do not exist; the guarantee is the tell.', defense: 'Ask for audited income disclosures and the real base rate of people who profit. In MLMs the FTC has found most participants lose money. "Not a pyramid scheme" is what pyramid schemes say.', contextual: true },
    { id: 'mlm-denial', techniqueId: 'mlm-recruitment-pitch', name: 'Pre-emptive "not a pyramid scheme"', bucket: 'engagement', harmClass: 'manipulative', weight: 0.9, patterns: [ph(['not a pyramid scheme', "it's not a pyramid scheme", 'it is not a pyramid scheme', 'this is not a pyramid', 'not an mlm', 'this is not mlm', 'this isn\'t mlm', 'not a scam, i promise', 'this is not a scam', "it's not a scam", 'i know what you are thinking, but this is different', "i know what you're thinking, but this is different", 'before you say pyramid'])], explanation: 'The pitch denies an accusation nobody made yet. Pre-emptive denial is a tell: legitimate businesses rarely need to say what they are not, and the denial primes you to dismiss the very question you should ask.', defense: 'Take the denial as a prompt to ask exactly that question: where does the revenue come from — product sales to outside customers, or recruitment? Ask for the income disclosure statement.' },
    { id: 'code-request', techniqueId: 'credential-harvesting', name: 'Verification-code or password request', bucket: 'scam', harmClass: 'manipulative', weight: 1.4, patterns: [/\b(?:(?:read|tell|give|send|text|share) (?:me|us) (?:the|your) (?:code|verification code|security code|one[- ]time (?:code|passcode|password)|otp|pin|password|passcode)|what(?:'s| is) the code (?:we|i|they) (?:just )?sent|the code (?:we|i) (?:just )?sent you|enter the code (?:we|i) sent|confirm the code|(?:your|the) (?:code|pin|password) (?:is|so i can|so we can))\b/gi], explanation: 'Someone asks for a verification code, PIN, or password. Codes exist so that only you can approve a login or payment; anyone asking for one is trying to be you.', defense: 'Never share a code with anyone, for any reason, including "the bank". If a code arrives that you did not request, someone is trying to get into your account — change the password.' },
    // ── Engagement bait ──
    { id: 'clickbait', techniqueId: 'clickbait', name: 'Curiosity-gap clickbait', bucket: 'engagement', harmClass: 'manipulative', weight: 0.6, patterns: [ph(CLICKBAIT)], explanation: 'A gap is opened between what you know and what you are promised, and closed only by clicking. The technique works whether or not the payoff exists.', defense: 'Assume the payoff is smaller than the promise. If the headline could be written without the gap, ask why it was not.' },
    { id: 'engagement-bait', techniqueId: 'engagement-bait', name: 'Engagement bait', bucket: 'engagement', harmClass: 'manipulative', weight: 0.6, patterns: [ph(ENGAGEMENT_BAIT)], explanation: 'You are asked to like, share, tag, or comment as a test of identity or intelligence. Engagement feeds the algorithm; the message is the vehicle.', defense: 'Notice the ask and do the opposite. A post that needs your engagement to spread is being optimized for reach, not truth.' },
    // ---- Dark patterns (consumer / subscription copy; ids from the dark-patterns batch) ----
    { id: 'confirmshaming', techniqueId: 'confirmshaming', name: 'Confirmshaming decline option', bucket: 'deception', harmClass: 'manipulative', weight: 1.0, patterns: [/\bno,?\s+thanks?,?\s+i\s+(?:don'?t|do not)\s+(?:want|need|care)/gi, /\bi'?d\s+rather\s+(?:pay\s+full\s+price|miss\s+out|stay\s+(?:broke|uninformed|unprotected)|not\s+save)/gi, /\bno,?\s+i\s+(?:like|love|prefer|enjoy)\s+(?:paying|wasting|losing|missing)/gi, /\b(?:don'?t|do not)\s+want\s+to\s+save\s+money\b/gi], explanation: 'The decline option is worded to make refusing feel stupid or shameful ("No thanks, I don\'t want to save money"). The choice is framed, not offered.', defense: 'Read the decline button as a plain "No". Shame written by a marketer is not information about you. Deceptive design can be reported to the FTC, or under the EU Digital Services Act.' },
    { id: 'roach-motel', techniqueId: 'roach-motel', name: 'Easy in, hard out', bucket: 'deception', harmClass: 'manipulative', weight: 0.9, patterns: [/\bto\s+cancel,?\s+(?:please\s+)?(?:call|phone|write|mail|visit)\b/gi, /\bcancell?ations?\s+(?:requests?\s+)?(?:must|can\s+only|may\s+only)\s+be\s+(?:made|submitted|processed)\s+(?:by|via|in|over)\s+(?:phone|mail|writing|person|fax)/gi, /\b(?:call|phone)\s+(?:us\s+)?(?:during\s+business\s+hours\s+)?to\s+cancel\b/gi], explanation: 'Signing up took one click; leaving requires a phone call, a letter, or a chat queue. The asymmetry is designed to keep you paying past the point you decided to stop.', defense: 'Before subscribing, search "[service] cancel". Pay with a virtual card you can freeze, calendar the renewal date, and screenshot the cancel flow. Several US states and the FTC require cancellation to be as easy as sign-up.' },
    { id: 'forced-continuity', techniqueId: 'forced-continuity', name: 'Trial converts to paid', bucket: 'deception', harmClass: 'dual-use', weight: 0.6, patterns: [/\b(?:free\s+)?trial\b[^.!?]{0,80}\b(?:automatically|auto)[-\s]?(?:renews?|converts?|bills?|charges?|billed|charged)/gi, /\bafter\s+(?:your|the)\s+(?:free\s+)?trial,?\s+(?:you'?ll|you\s+will)\s+be\s+(?:charged|billed)/gi, /\bunless\s+(?:you\s+)?cancel(?:led|ed)?\s+(?:before|prior\s+to|by)\b/gi], explanation: 'A free trial that silently becomes a paid subscription relies on you forgetting. Disclosed clearly and cancellable easily, it is a legitimate offer; buried in fine print, it is a trap.', defense: 'Set a reminder for the day before the trial ends at the moment you sign up, and pay with a virtual card you can turn off.', contextual: true },
    { id: 'drip-pricing', techniqueId: 'drip-pricing', name: 'Fees added late', bucket: 'deception', harmClass: 'dual-use', weight: 0.6, patterns: [/\b(?:plus|excl\.?|exclud(?:es?|ing)|exclusive\s+of|not\s+including|before)\s+(?:applicable\s+)?(?:taxes?|fees|service\s+fees?|shipping|surcharges?)\b/gi, /\b(?:service|convenience|processing|resort|booking|handling|facility)\s+fees?\s+(?:apply|applies|added|will\s+be\s+added|not\s+included)\b/gi, /\btaxes?\s+and\s+fees\s+(?:not\s+included|extra|additional)\b/gi], explanation: 'The headline price is low; the real price appears at checkout after you have invested time and committed. Mandatory fees revealed late are the pattern regulators call drip pricing.', defense: 'Compare total prices only. If the total is not shown up front, assume the headline is not the price. Many jurisdictions now require all-in pricing.', contextual: true },
    { id: 'consent-theater', techniqueId: 'consent-theater', name: 'Consent by continuing', bucket: 'deception', harmClass: 'manipulative', weight: 0.5, patterns: [/\bby\s+(?:continuing|using\s+(?:this|our)\s+(?:site|app|service|website)|clicking|browsing|scrolling|proceeding),?\s+you\s+(?:agree|consent|accept|acknowledge)\b/gi], explanation: 'Agreement is assumed from an action you would take anyway. No meaningful choice was offered, so the "consent" is a record, not a decision.', defense: 'Look for a real reject option. Under the GDPR and similar laws, refusing must be as easy as accepting; a banner without a reject button is non-compliant.', contextual: true },
    { id: 'streak-pressure', techniqueId: 'streak-mechanics', name: 'Streak pressure', bucket: 'engagement', harmClass: 'dual-use', weight: 0.4, patterns: [/\b(?:don'?t|do not)\s+(?:break|lose)\s+your\s+streak\b/gi, /\b\d+[-\s]day\s+streak\b/gi, /\byour\s+streak\s+(?:is\s+)?(?:at\s+risk|will\s+(?:end|reset|be\s+lost))/gi], explanation: 'Loss aversion attached to a counter: the product manufactures something to lose so that skipping a day feels like failure. Useful for a habit you chose; a leash for one you did not.', defense: 'Ask whether you would use the product today without the counter. If not, the streak is the product\'s goal, not yours.', contextual: true },
    { id: 'referral-pressure', techniqueId: 'referral-pressure', name: 'Recruit your friends', bucket: 'engagement', harmClass: 'dual-use', weight: 0.4, patterns: [/\b(?:invite|refer)\s+(?:\d+|a|your|three|five|ten)\s+friends?\b/gi, /\b(?:unlock|earn|get)\b[^.!?]{0,40}\b(?:when|if|after)\s+(?:you\s+)?(?:invite|refer)\b/gi, /\bshare\s+(?:with|to)\s+\d+\s+(?:friends|contacts|people)\s+to\s+(?:unlock|continue|claim)/gi], explanation: 'Your social graph becomes the growth channel and your friendships absorb the cost. Referral rewards are legitimate when optional and disclosed; gating features behind recruiting is not.', defense: 'Never trade contacts for features. If a reward requires messaging people who did not ask, the people being sold are your friends.', contextual: true },
];
const SIGNATURES = [
    {
        id: 'carrot-and-stick',
        name: 'Carrot-and-stick coercion',
        description: 'A reward is offered for compliance and a cost attached to refusal in the same message. Persuasion by payoff and penalty rather than by reasons — the structure of bribery and extortion.',
        bonus: 1.5,
        severity: 'high',
        advice: 'Evaluate the request as if neither the reward nor the threat existed. If it would be wrong or unwise on its own, the payoff is buying something you should not sell. Keep a copy of the message.',
        test: (r) => r.has('inducement') && (r.has('conditional-threat') || r.has('reward-withdrawal') || r.has('ultimatum') || r.has('violence-rhetoric')),
    },
    {
        id: 'scam-triad',
        name: 'Scam signature: urgency + authority + unusual payment or secrecy',
        description: 'Cialdini\'s principles as scammers use them: a trusted-sounding sender, a deadline, and a demand that cannot be undone or checked (gift cards, wire, codes, "tell no one").',
        bonus: 2.0,
        severity: 'severe',
        advice: 'Stop. Do not pay, click, or share a code. Contact the real organization on a number you look up yourself. Report to reportfraud.ftc.gov (US), Action Fraud (UK), or your national fraud line.',
        test: (r, b) => {
            const authority = r.has('impersonated-authority') || r.has('account-lure') || r.has('bec') || r.has('prize-lure') || r.has('authority-cues');
            const irreversible = r.has('payment-method') || r.has('secrecy') || r.has('code-request');
            const pressure = b.has('pressure') || r.has('conditional-threat') || r.has('violence-rhetoric');
            // An impersonated authority demanding an irreversible payment method is the triad even when the
            // deadline is implicit ("a warrant has been issued" is its own urgency).
            return authority && irreversible && (pressure || r.has('impersonated-authority'));
        },
    },
    {
        id: 'phishing-pattern',
        name: 'Phishing pattern: account alert + action link + deadline',
        description: 'The three components of a credential-harvesting message. Any one is common in legitimate mail; all three together is the attack.',
        bonus: 1.2,
        severity: 'high',
        advice: 'Open the service directly (type the address or use the app). Never use the link in the message. Turn on multi-factor authentication.',
        test: (r, b) => r.has('account-lure') && b.has('pressure'),
    },
    {
        id: 'bec-pattern',
        name: 'Executive-impersonation pattern',
        description: 'Urgency, a request for discretion, and a payment or bank-detail change from someone who "cannot talk right now".',
        bonus: 1.5,
        severity: 'severe',
        advice: 'Verify by voice on a known number before any payment or bank-detail change. Never reply to the message to verify it.',
        test: (r) => r.has('bec') && (r.has('secrecy') || r.has('payment-method') || r.has('urgency')),
    },
    {
        id: 'romance-scam',
        name: 'Romance-plus-money pattern',
        description: 'Intense affection combined with a request for money, an emergency, or an investment platform.',
        bonus: 1.5,
        severity: 'severe',
        advice: 'Do not send money or invest. Reverse-image-search the photos. Talk to someone you trust about the relationship before doing anything else.',
        test: (r) => (r.has('romance-money') || r.has('love-bombing')) && (r.has('payment-method') || r.has('investment-hype') || r.has('urgency') || r.has('secrecy')),
    },
    {
        id: 'coercive-control-cluster',
        name: 'Coercive-control language cluster',
        description: 'Two or more control tactics together — reality denial, blame reversal, isolation, guilt, emotional blackmail, monitoring. A pattern, not an incident, is what defines coercive control.',
        bonus: 1.5,
        severity: 'severe',
        advice: 'If this is from a partner or family member, please talk to someone trained in this: US National Domestic Violence Hotline 1-800-799-7233 (thehotline.org, chat and text available); international directory at hotpeachpages.net. Your safety comes before documentation or confrontation.',
        test: (r) => {
            const core = ['gaslighting', 'darvo', 'isolation', 'guilt', 'emotional-blackmail', 'minimization', 'global-criticism', 'love-bombing'].filter((id) => r.has(id)).length;
            const support = ['reward-withdrawal', 'conditional-threat', 'secrecy', 'ultimatum'].filter((id) => r.has(id)).length;
            return core >= 2 || (core >= 1 && support >= 1);
        },
    },
    {
        id: 'propaganda-cluster',
        name: 'Propaganda cluster',
        description: 'An enemy (us-versus-them, dehumanization, or scapegoating), a strong emotion (fear or outrage), and a closed frame (unearned certainty, thought-terminating clichés, or a conspiracy frame) in one message.',
        bonus: 1.5,
        severity: 'high',
        advice: 'Read it for who is named as the enemy and what you are asked to feel. Then check the factual claims laterally, and ask what the speaker gains if you feel that way.',
        test: (r) => (r.has('us-them') || r.has('dehumanization') || r.has('enemy-blame')) && (r.has('fear-appeal') || r.has('loaded-outrage')) && (r.has('unearned-certainty') || r.has('thought-terminating') || r.has('conspiracy-frame') || r.has('false-dichotomy')),
    },
    {
        id: 'sales-pressure',
        name: 'High-pressure sales pattern',
        description: 'Urgency or scarcity combined with social proof or authority — the standard closing pattern. Legitimate when the facts are real; the pattern itself is designed to stop comparison shopping.',
        bonus: 0.8,
        severity: 'medium',
        advice: 'Sleep on it. Search "[product] review" and "[product] cancel" before buying. A real deal is still a deal tomorrow.',
        test: (r, b) => b.has('pressure') && (r.has('social-proof') || r.has('authority-cues') || r.has('unnamed-authority') || r.has('testimonial-cue')),
    },
    {
        id: 'recruitment-pattern',
        name: 'Recruitment / MLM pattern',
        description: 'Dense income-freedom vocabulary ("passive income", "six figures", "join my team", "DM me") with or without a pre-emptive "not a pyramid scheme". The product is rarely mentioned; the opportunity is.',
        bonus: 1.2,
        severity: 'high',
        advice: 'Ask where the money comes from: retail sales to outside customers, or recruits buying in? Request the income disclosure statement — in most MLMs the median participant earns little or loses money (FTC).',
        test: (r, b, m) => { var _a; return (((_a = m.get('investment-hype')) === null || _a === void 0 ? void 0 : _a.count) || 0) >= 3 || (r.has('mlm-denial') && r.has('investment-hype')); },
    },
    {
        id: 'clickbait-cluster',
        name: 'Engagement-farming pattern',
        description: 'Curiosity gap, engagement instruction, and urgency or conspiracy framing together — content built to travel rather than to inform.',
        bonus: 0.8,
        severity: 'medium',
        advice: 'Do not share. If the claim matters, find it reported by a source that names its evidence.',
        test: (r) => (r.has('clickbait') || r.has('engagement-bait')) && (r.has('urgency') || r.has('conspiracy-frame') || r.has('loaded-outrage')),
    },
];
// ─────────────────────────────────────────────────────────────────────────────
// Domain classification
// ─────────────────────────────────────────────────────────────────────────────
const DOMAIN_KEYWORDS = {
    marketing: ['buy', 'sale', 'discount', 'offer', 'free shipping', 'exclusive', 'deal', 'save', 'price', 'order now', 'best seller', 'customer', 'product', 'brand', 'subscribe', 'premium', 'checkout', 'cart', 'promotion', 'unsubscribe', 'coupon', 'promo code', 'pricing', 'plan', 'upgrade', 'trial'],
    politics: ['vote', 'election', 'democrat', 'republican', 'liberal', 'conservative', 'policy', 'government', 'congress', 'senate', 'parliament', 'president', 'campaign', 'legislation', 'bipartisan', 'constituent', 'politician', 'party', 'ballot', 'rally', 'mandate', 'candidate', 'the left', 'the right', 'my fellow', 'fellow citizens', 'this administration', 'the bill'],
    news: ['reported', 'sources say', 'according to', 'breaking', 'developing', 'officials', 'spokesperson', 'investigation', 'press release', 'correspondent', 'statement', 'briefing', 'incident', 'witnesses', 'reuters', 'associated press', 'the journal reported'],
    personal: ['babe', 'baby', 'honey', 'sweetheart', 'i love you', 'love you', 'our relationship', 'my mom', 'my dad', 'your mother', 'your father', 'our marriage', 'my husband', 'my wife', 'my boyfriend', 'my girlfriend', 'my partner', 'my ex', 'the kids', 'our kids', 'you promised', 'i miss you', 'come home'],
    workplace: ['manager', 'the team', 'deadline', 'project', 'performance review', 'hr', 'human resources', 'your role', 'headcount', 'q3', 'q4', 'quarter', 'stakeholders', 'deliverable', 'okr', 'kpi', 'promotion', 'your position', 'the company', 'leadership', 'fire him', 'fire her', 'his spot', 'her spot', 'his job', 'her job', 'the board', 'my boss', 'your boss'],
    security: ['account', 'password', 'verify', 'login', 'log in', 'sign in', 'suspended', 'security', 'unusual activity', 'click here', 'attachment', 'invoice', 'remote access', 'gift card', 'wire', 'bitcoin', 'crypto', 'code', 'otp', 'irs', 'refund', 'package', 'delivery', 'customs'],
    finance: ['invest', 'investment', 'returns', 'profit', 'trading', 'stock', 'crypto', 'portfolio', 'dividend', 'guaranteed', 'passive income', 'financial freedom', 'wealth', 'retire early', 'roi', 'the market', 'token', 'coin'],
    'social-media': ['like and share', 'follow', 'subscribe', 'comment below', 'tag someone', 'viral', 'trending', 'dm me', 'link in bio', 'swipe up', 'retweet', 'repost', 'thread', 'ratio', 'influencer', 'content creator', 'algorithm', 'engagement', 'clout', 'hashtag', '#'],
    academic: ['hypothesis', 'methodology', 'peer-reviewed', 'peer reviewed', 'data suggest', 'statistically significant', 'correlation', 'findings', 'literature', 'framework', 'empirical', 'variables', 'sample size', 'the study', 'participants', 'abstract', 'et al', 'we argue', 'this paper'],
    legal: ['plaintiff', 'defendant', 'jurisdiction', 'statute', 'pursuant', 'hereby', 'whereas', 'liability', 'indemnify', 'arbitration', 'breach', 'enforceable', 'stipulate', 'clause', 'provision', 'your honor', 'the court', 'the jury', 'ladies and gentlemen of the jury', 'objection', 'counsel', 'the defendant', 'the evidence will show', 'beyond a reasonable doubt', 'preponderance'],
    religious: ['faith', 'salvation', 'blessed', 'scripture', 'divine', 'pray', 'sin', 'righteous', 'holy', 'eternal', 'soul', 'worship', 'gospel', 'revelation', 'congregation', 'the lord', 'god\'s plan', 'the leader', 'the teacher', 'the guru', 'enlightenment', 'ascension'],
    conspiracy: ['deep state', 'false flag', 'new world order', 'big pharma', 'mainstream media', 'globalist', 'controlled opposition', 'crisis actor', 'plandemic', 'sheeple', 'red pill', 'wake up', 'truth movement', 'puppet master', 'agenda', 'cover-up', 'they don\'t want you to know', 'do your own research'],
};
const DOMAIN_LABELS = {
    general: 'General',
    marketing: 'Marketing / sales',
    politics: 'Political',
    news: 'News / reporting',
    personal: 'Personal relationship',
    workplace: 'Workplace',
    security: 'Security / account message',
    finance: 'Finance / investment',
    'social-media': 'Social media',
    academic: 'Academic / research',
    legal: 'Legal',
    religious: 'Religious / spiritual group',
    conspiracy: 'Conspiracy community',
};
function detectDomain(lower, ruleIds) {
    let best = 'general';
    let bestScore = 0;
    Object.keys(DOMAIN_KEYWORDS).forEach((d) => {
        let s = 0;
        for (const kw of DOMAIN_KEYWORDS[d])
            if (lower.includes(kw))
                s += kw.length > 6 ? 1.5 : 1;
        if (d === 'security' && (ruleIds.has('account-lure') || ruleIds.has('impersonated-authority') || ruleIds.has('payment-method') || ruleIds.has('code-request')))
            s += 4;
        if (d === 'personal' && (ruleIds.has('gaslighting') || ruleIds.has('darvo') || ruleIds.has('isolation') || ruleIds.has('emotional-blackmail') || ruleIds.has('love-bombing')))
            s += 3;
        if (d === 'finance' && (ruleIds.has('investment-hype') || ruleIds.has('romance-money')))
            s += 2;
        if (d === 'politics' && (ruleIds.has('us-them') || ruleIds.has('glittering')))
            s += 1.5;
        if (s > bestScore) {
            bestScore = s;
            best = d;
        }
    });
    return bestScore >= 2 ? best : 'general';
}
// ─────────────────────────────────────────────────────────────────────────────
// Stylometry
// ─────────────────────────────────────────────────────────────────────────────
function computeStylometry(text) {
    const ws = words(text);
    const ss = sentences(text);
    const n = ws.length;
    if (n === 0) {
        return { words: 0, sentences: 0, avgWordLength: 0, avgSentenceLength: 0, typeTokenRatio: 0, fleschReadingEase: 0, functionWordRatio: 0, exclamationsPer100Words: 0, questionsPer100Words: 0, capsWordRatio: 0, secondPersonPer100Words: 0, imperativeEstimatePer100Words: 0 };
    }
    let chars = 0;
    let syl = 0;
    let fn = 0;
    let caps = 0;
    let second = 0;
    const uniq = new Set();
    for (const w of ws) {
        const lw = w.toLowerCase();
        chars += w.replace(/['’-]/g, '').length;
        syl += syllables(w);
        uniq.add(lw);
        if (FUNCTION_WORDS.has(lw))
            fn++;
        if (w.length >= 4 && w === w.toUpperCase() && /[A-Z]/.test(w))
            caps++;
        if (lw === 'you' || lw === 'your' || lw === 'yours' || lw === 'yourself' || lw === "you're" || lw === "you'll" || lw === "you've" || lw === "you'd")
            second++;
    }
    const sentCount = Math.max(1, ss.length);
    const fre = 206.835 - 1.015 * (n / sentCount) - 84.6 * (syl / n);
    const excl = (text.match(/!/g) || []).length;
    const q = (text.match(/\?/g) || []).length;
    const imperative = ss.filter((s) => /^(?:please\s+)?(?:do|don't|do not|stop|call|click|send|buy|act|sign|share|verify|confirm|join|get|take|make|pay|reply|respond|order|claim|download|install|listen|remember|think|wake|open|forward|vote|give|hurry|trust|believe)\b/i.test(s)).length;
    return {
        words: n,
        sentences: ss.length,
        avgWordLength: +(chars / n).toFixed(2),
        avgSentenceLength: +(n / sentCount).toFixed(2),
        typeTokenRatio: +(uniq.size / n).toFixed(3),
        fleschReadingEase: +Math.max(0, Math.min(100, fre)).toFixed(1),
        functionWordRatio: +(fn / n).toFixed(3),
        exclamationsPer100Words: +((excl / n) * 100).toFixed(2),
        questionsPer100Words: +((q / n) * 100).toFixed(2),
        capsWordRatio: +(caps / n).toFixed(3),
        secondPersonPer100Words: +((second / n) * 100).toFixed(2),
        imperativeEstimatePer100Words: +((imperative / n) * 100).toFixed(2),
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Core analysis
// ─────────────────────────────────────────────────────────────────────────────
const CLASS_MULT = { neutral: 0.25, 'dual-use': 0.7, manipulative: 1.0, abuse: 1.5 };
function severityFor(contribution, harmClass) {
    if (harmClass === 'abuse')
        return contribution >= 1.8 ? 'severe' : 'high';
    if (contribution >= 1.6)
        return 'severe';
    if (contribution >= 1.0)
        return 'high';
    if (contribution >= 0.5)
        return 'medium';
    return 'low';
}
const CANNOT_SEE = [
    'Whether a claim is actually false — the engine sees structure and vocabulary, not facts. A calm, well-written lie scores low.',
    'Intent. A phrase can be a tactic or an accident; only a pattern over time, or context you have, tells you which.',
    'Omission: what a message leaves out (card stacking, paltering, cherry-picked statistics) is invisible to a pattern engine.',
    'Context-dependent techniques: anchoring and decoy pricing (need the other options), intermittent reinforcement and trauma bonding (need time), triangulation and flying monkeys (need the other people), Overton-window shifting and agenda setting (need the wider discourse).',
    'Coordination: astroturfing, brigading, and bot amplification are visible in account networks, not in a single text.',
    'Sarcasm, quotation, and reporting. A journalist quoting a threat, or a friend joking, will trigger the same rules as the real thing.',
];
const BAND_LABELS = {
    minimal: 'Minimal manipulation signals',
    low: 'Low — ordinary persuasion',
    moderate: 'Moderate — read critically',
    high: 'High — strong manipulation patterns',
    severe: 'Severe — coercive, deceptive, or abusive patterns',
};
function bandFor(score) {
    if (score < 15)
        return 'minimal';
    if (score < 35)
        return 'low';
    if (score < 55)
        return 'moderate';
    if (score < 75)
        return 'high';
    return 'severe';
}
function verdictFor(band, top, sigs) {
    if (sigs.length && (sigs[0].severity === 'severe' || sigs[0].severity === 'high'))
        return sigs[0].name;
    if (band === 'minimal')
        return 'No strong manipulation patterns found. That is not a certificate of honesty — see the caveats.';
    if (!top.length)
        return BAND_LABELS[band];
    const names = top.slice(0, 3).map((h) => h.name.toLowerCase());
    const lead = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    return (band === 'low' ? 'Mostly ordinary persuasion, with ' : band === 'moderate' ? 'Notable use of ' : 'Heavy use of ') + lead + '.';
}
function analyzeText(input, options = {}) {
    const maxChars = options.maxChars || 20000;
    const raw = (input || '').slice(0, maxChars);
    const text = normalize(raw);
    const lower = text.toLowerCase();
    const stylometry = computeStylometry(text);
    const wc = Math.max(1, stylometry.words);
    // 1. Run rules
    const hits = [];
    for (const rule of DETECTOR_RULES) {
        const seen = new Set();
        const matches = [];
        for (const pat of rule.patterns) {
            const re = new RegExp(pat.source, pat.flags.includes('g') ? pat.flags : pat.flags + 'g');
            let m;
            let guard = 0;
            while ((m = re.exec(text)) && guard++ < 500) {
                if (m[0].length === 0) {
                    re.lastIndex++;
                    continue;
                }
                const key = m.index + ':' + m[0].length;
                if (seen.has(key))
                    continue;
                seen.add(key);
                matches.push({ start: m.index, end: m.index + m[0].length, text: raw.slice(m.index, m.index + m[0].length) });
            }
        }
        const minMatches = rule.minMatches || 1;
        if (matches.length < minMatches)
            continue;
        matches.sort((a, b) => a.start - b.start);
        const counted = Math.min(matches.length, rule.maxCounted || 3);
        const contribution = rule.weight * CLASS_MULT[rule.harmClass] * (1 + 0.5 * (counted - 1));
        hits.push({
            ruleId: rule.id,
            techniqueId: rule.techniqueId,
            name: rule.name,
            bucket: rule.bucket,
            harmClass: rule.harmClass,
            severity: severityFor(contribution, rule.harmClass),
            possible: false,
            count: matches.length,
            matches,
            explanation: rule.explanation,
            defense: rule.defense,
            contribution,
        });
    }
    // 2. Contextual rules are "possible" (and discounted) unless corroborated by a non-contextual hit,
    //    by two or more other rules, or by their own density (three matches of the same contextual
    //    vocabulary in one message is no longer ambiguous).
    const strong = hits.filter((h) => !DETECTOR_RULES.find((r) => r.id === h.ruleId).contextual || h.count >= 3);
    const corroborated = strong.length > 0 || hits.length >= 3;
    for (const h of hits) {
        const rule = DETECTOR_RULES.find((r) => r.id === h.ruleId);
        if (rule.contextual && !corroborated && h.count < 3) {
            h.possible = true;
            h.contribution *= 0.5;
            h.severity = severityFor(h.contribution, h.harmClass);
        }
    }
    // 3. Signatures
    const ruleIds = new Set(hits.map((h) => h.ruleId));
    const bucketSet = new Set(hits.map((h) => h.bucket));
    const hitsByRule = new Map(hits.map((h) => [h.ruleId, h]));
    const signatures = [];
    for (const s of SIGNATURES) {
        if (s.test(ruleIds, bucketSet, hitsByRule))
            signatures.push({ id: s.id, name: s.name, description: s.description, bonus: s.bonus, severity: s.severity, advice: s.advice });
    }
    signatures.sort((a, b) => b.bonus - a.bonus);
    // 4. Score
    let rawScore = hits.reduce((sum, h) => sum + h.contribution, 0) + signatures.reduce((sum, s) => sum + s.bonus, 0);
    const lengthFactor = 0.6 + 0.4 * Math.min(1, 60 / wc); // short texts count fully; long texts are diluted
    rawScore *= lengthFactor;
    const score = Math.round(100 * (1 - Math.exp(-rawScore / 4)));
    const band = bandFor(score);
    // 5. Confidence
    const distinct = new Set(hits.filter((h) => !h.possible).map((h) => h.ruleId)).size;
    let confidence = 'moderate';
    let confidenceNote = 'Several independent signals; treat the score as a reasonable estimate, not a verdict.';
    if (wc < 15) {
        confidence = 'low';
        confidenceNote = 'Very short text: a handful of words can trigger or miss a rule by chance. Read the individual hits rather than the score.';
    }
    else if (hits.length === 0) {
        confidence = 'moderate';
        confidenceNote = 'No rules fired. This engine cannot see factual falsehood, omission, or context — a clean scan is not proof of honesty.';
    }
    else if (distinct >= 3 && bucketSet.size >= 2 && wc >= 40) {
        confidence = 'high';
        confidenceNote = 'Multiple independent, non-ambiguous signals across more than one category.';
    }
    else if (distinct <= 1) {
        confidence = 'low';
        confidenceNote = 'One or two signals only; the phrases involved also occur in ordinary speech. Check the quoted matches in context before drawing conclusions.';
    }
    // 6. Domain, verdict, summary
    const domain = detectDomain(lower, ruleIds);
    hits.sort((a, b) => b.contribution - a.contribution);
    const verdict = verdictFor(band, hits, signatures);
    const bucketCounts = {};
    const totalContribution = hits.reduce((s, h) => s + h.contribution, 0) || 1;
    Object.keys(BUCKET_META).forEach((b) => {
        const bh = hits.filter((h) => h.bucket === b);
        bucketCounts[b] = { label: BUCKET_META[b].label, color: BUCKET_META[b].color, hits: bh.length, matches: bh.reduce((s, h) => s + h.count, 0), share: +(bh.reduce((s, h) => s + h.contribution, 0) / totalContribution).toFixed(3) };
    });
    const summaryParts = [];
    summaryParts.push(BAND_LABELS[band] + '.');
    if (signatures.length)
        summaryParts.push('Pattern' + (signatures.length > 1 ? 's' : '') + ': ' + signatures.map((s) => s.name).join('; ') + '.');
    if (hits.length)
        summaryParts.push(hits.length + ' technique' + (hits.length === 1 ? '' : 's') + ' matched across ' + bucketSet.size + ' categor' + (bucketSet.size === 1 ? 'y' : 'ies') + '; strongest: ' + hits.slice(0, 3).map((h) => h.name).join(', ') + '.');
    summaryParts.push('Confidence: ' + confidence + '.');
    // 7. Next steps: signature advice first, then top hit defenses
    const nextSteps = [];
    for (const s of signatures)
        if (s.advice && !nextSteps.includes(s.advice))
            nextSteps.push(s.advice);
    for (const h of hits) {
        if (nextSteps.length >= 6)
            break;
        if (!nextSteps.includes(h.defense))
            nextSteps.push(h.defense);
    }
    if (!nextSteps.length)
        nextSteps.push('Nothing flagged. If the message still feels off, check the factual claims laterally (search the claim, see who else reports it), and notice what it leaves out.');
    const caveats = [
        'Pattern matches are prompts for your own judgment, not verdicts. A technique being present does not prove deceptive intent; many are legitimate when the underlying facts are real.',
        'A low score is not certification. Factual deception, omission, and context-dependent techniques do not show up here.',
    ];
    if (wc < 25)
        caveats.push('Short input: scores on very short texts are noisy. The quoted matches are more informative than the number.');
    if (signatures.some((s) => s.id === 'coercive-control-cluster' || s.id === 'romance-scam' || s.id === 'scam-triad'))
        caveats.push('If this message is about you and you are unsafe, prioritize safety over analysis. Support resources are listed in the pattern advice above.');
    // 8. Highlight spans (non-overlapping; earliest start, then longest)
    const marks = [];
    for (const h of hits)
        for (const m of h.matches)
            marks.push({ start: m.start, end: m.end, bucket: h.bucket, label: h.name, techniqueId: h.techniqueId });
    marks.sort((a, b) => (a.start - b.start) || ((b.end - b.start) - (a.end - a.start)));
    const spans = [];
    let lastEnd = -1;
    for (const m of marks) {
        if (m.start >= lastEnd) {
            spans.push(m);
            lastEnd = m.end;
        }
    }
    return {
        version: DETECTOR_VERSION,
        score,
        band,
        bandLabel: BAND_LABELS[band],
        verdict,
        summary: summaryParts.join(' '),
        confidence,
        confidenceNote,
        domain,
        domainLabel: DOMAIN_LABELS[domain],
        hits,
        signatures,
        buckets: bucketCounts,
        stylometry,
        spans,
        nextSteps,
        caveats,
        cannotSee: CANNOT_SEE,
    };
}
/** Render highlight spans into HTML with a class per bucket (hl-<bucket>). Escapes text. */
function renderHighlightedHtml(text, spans, classPrefix = 'hl-') {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let html = '';
    let cursor = 0;
    for (const sp of spans) {
        if (sp.start > cursor)
            html += esc(text.slice(cursor, sp.start));
        html += '<mark class="' + classPrefix + sp.bucket + '" data-technique="' + esc(sp.techniqueId) + '" title="' + esc(sp.label) + '">' + esc(text.slice(sp.start, sp.end)) + '</mark>';
        cursor = sp.end;
    }
    if (cursor < text.length)
        html += esc(text.slice(cursor));
    return html;
}
/** Compact, prompt-friendly rendering of a result for the hybrid AI detector (rule pre-scan → model confirms/rejects). */
function summarizeForPrompt(result) {
    const lines = [];
    lines.push('RULE-BASED PRE-SCAN (engine v' + result.version + '): score ' + result.score + '/100 (' + result.band + '), confidence ' + result.confidence + ', domain guess: ' + result.domainLabel + '.');
    if (result.signatures.length)
        lines.push('Signatures: ' + result.signatures.map((s) => s.name).join('; '));
    for (const h of result.hits.slice(0, 15)) {
        lines.push('- [' + h.techniqueId + '] ' + h.name + ' (' + h.harmClass + ', ' + h.severity + (h.possible ? ', possible' : '') + '): ' + h.matches.slice(0, 3).map((m) => '"' + m.text.replace(/\s+/g, ' ').slice(0, 80) + '"').join(', '));
    }
    if (!result.hits.length)
        lines.push('- no rule hits');
    return lines.join('\n');
}

global.PersuasionDetector = { analyzeText, computeStylometry, renderHighlightedHtml, summarizeForPrompt, DETECTOR_RULES, BUCKET_META, CANNOT_SEE, DETECTOR_VERSION };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
