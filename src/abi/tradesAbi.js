export const TRADES_ABI = [
  // Opened (deux variantes gérées)
  "event Opened(uint32 indexed id, uint8 state, uint32 asset, bool longSide, uint16 lots, int64 entryOrTargetX6)",
  "event Opened(uint32 indexed id, uint8 state, uint32 asset, bool longSide, uint16 lots, int64 entryOrTargetX6, int64 slX6, int64 tpX6, int64 liqX6)",

  // Executed (LIMIT -> OPEN)
  "event Executed(uint32 indexed id, int64 entryX6)",

  // StopsUpdated
  "event StopsUpdated(uint32 indexed id, int64 slX6, int64 tpX6)",

  // Removed (CLOSED ou CANCELLED)
  "event Removed(uint32 indexed id, uint8 reason, int64 execX6, int256 pnlUsd6)"
];
