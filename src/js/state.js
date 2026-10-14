// Single mutable app state shared by all modules (ES module bindings are read-only).
export const state = {
    doc: null,
    undoStack: [],
    redoStack: [],
    selectedId: null,
    searchTerm: "",
    lastSaveFile: null,
    // view navigation (§9.3)
    navBack: [],
    navFwd: [],
    // render bookkeeping
    pendingFocus: null,
    animateNext: false,
    lastProj: null,
    cellMax: 0,
    capLifted: false,
     // last focused cell {r, c}, used as agent scope
     agentCell: null,
};

export const activeView = () =>
    state.doc.views.find(v => v.id === state.doc.activeView) || state.doc.views[0];