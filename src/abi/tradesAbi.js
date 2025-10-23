export const TRADES_ABI = [
  // Opened (unique version)
  "event Opened(uint32 indexed id, uint8 state, uint32 asset, bool longSide, uint16 lots, int64 entryOrTargetX6, int64 slX6, int64 tpX6, int64 liqX6)",

  // Executed (LIMIT -> OPEN)
  "event Executed(uint32 indexed id, int64 entryX6)",

  // StopsUpdated
  "event StopsUpdated(uint32 indexed id, int64 slX6, int64 tpX6)",

  // Closed (fermeture ou annulation)
  "event Closed(uint32 indexed id, int64 execX6, int256 pnlUsd6,
