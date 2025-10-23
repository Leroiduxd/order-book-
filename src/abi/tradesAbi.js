export const TRADES_ABI = [
  // Création d’une position (MARKET ou LIMIT)
  "event Opened(uint32 indexed id, uint8 state, uint32 indexed asset, bool longSide, uint16 lots, int64 entryOrTargetX6, int64 slX6, int64 tpX6, int64 liqX6)",

  // LIMIT exécuté -> OPEN
  "event Executed(uint32 indexed id, int64 entryX6)",

  // Mise à jour des stops
  "event StopsUpdated(uint32 indexed id, int64 slX6, int64 tpX6)",

  // Sortie du carnet (fermeture OU annulation)
  "event Removed(uint32 indexed id, uint8 reason, int64 execX6, int256 pnlUsd6)"
];
