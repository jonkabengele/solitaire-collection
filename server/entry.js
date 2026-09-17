/*
 * Nakama entry point — hand-written ES5 glue. Nakama's JS runtime
 * AST-parses THIS file: InitModule must be a top-level function/var
 * literal, and every registered handler must be an identifier bound to a
 * top-level function. Bundled code can't satisfy that, so these thin
 * forwards delegate into the `RaceEngine` global from engine.js.
 * (Load order is irrelevant — InitModule runs after all modules eval.)
 */

function matchInit(ctx, logger, nk, params) {
  return RaceEngine.matchInit(ctx, logger, nk, params);
}

function matchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
  return RaceEngine.matchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata);
}

function matchJoin(ctx, logger, nk, dispatcher, tick, state, presences) {
  return RaceEngine.matchJoin(ctx, logger, nk, dispatcher, tick, state, presences);
}

function matchLeave(ctx, logger, nk, dispatcher, tick, state, presences) {
  return RaceEngine.matchLeave(ctx, logger, nk, dispatcher, tick, state, presences);
}

function matchLoop(ctx, logger, nk, dispatcher, tick, state, messages) {
  return RaceEngine.matchLoop(ctx, logger, nk, dispatcher, tick, state, messages);
}

function matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  return RaceEngine.matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds);
}

function matchSignal(ctx, logger, nk, dispatcher, tick, state, data) {
  return RaceEngine.matchSignal(ctx, logger, nk, dispatcher, tick, state, data);
}

function raceMatchmakerMatched(ctx, logger, nk, matches) {
  return RaceEngine.matchmakerMatched(ctx, logger, nk, matches);
}

function rpcCreatePrivateRace(ctx, logger, nk, payload) {
  return RaceEngine.rpcCreatePrivateRace(ctx, logger, nk, payload);
}

function InitModule(ctx, logger, nk, initializer) {
  initializer.registerMatch('race', {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchTerminate: matchTerminate,
    matchSignal: matchSignal
  });
  initializer.registerMatchmakerMatched(raceMatchmakerMatched);
  initializer.registerRpc('create_private_race', rpcCreatePrivateRace);
  RaceEngine.setupLeaderboards(nk, logger);
}
