export const db = { type: 'localStore' };

const storeKey = (colPath: string) => `@masti_store_${colPath}`;

const getCollectionData = (colPath: string): Record<string, any> => {
  try {
    const raw = localStorage.getItem(storeKey(colPath));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const listeners = new Map<string, Set<() => void>>();

const notifyListeners = (colPath: string) => {
  const set = listeners.get(colPath);
  if (!set) return;
  set.forEach((emit) => emit());
};

const saveCollectionData = (colPath: string, data: Record<string, any>) => {
  try {
    localStorage.setItem(storeKey(colPath), JSON.stringify(data));
  } catch {}
  notifyListeners(colPath);
};

export const collection = (_db: any, ...pathSegments: string[]) => ({
  _isCollection: true,
  path: pathSegments.join('/'),
});

export const doc = (_db: any, ...pathSegments: string[]) => {
  const fullPath = pathSegments.join('/');
  const parts = fullPath.split('/');
  return {
    _isDoc: true,
    path: fullPath,
    id: parts[parts.length - 1],
    colPath: parts.slice(0, -1).join('/'),
  };
};

export const serverTimestamp = () => new Date().toISOString();

export const arrayUnion = (...elements: any[]) => ({
  _isArrayUnion: true,
  elements,
});

const applyFieldTransforms = (existing: any, incoming: any) => {
  const result = { ...incoming };
  for (const [k, v] of Object.entries(result)) {
    if (v && typeof v === 'object' && (v as any)._isArrayUnion) {
      const prevArr = Array.isArray(existing?.[k]) ? existing[k] : [];
      result[k] = Array.from(new Set([...prevArr, ...(v as any).elements]));
    }
  }
  return result;
};

export const setDoc = async (docRef: any, data: any, options?: { merge?: boolean }) => {
  const col = getCollectionData(docRef.colPath);
  const existing = col[docRef.id] || {};
  const transformed = applyFieldTransforms(existing, data);
  const updated = options?.merge ? { ...existing, ...transformed } : transformed;
  col[docRef.id] = updated;
  saveCollectionData(docRef.colPath, col);
};

export const updateDoc = async (docRef: any, data: any) => setDoc(docRef, data, { merge: true });

export const getDoc = async (docRef: any) => {
  const data = getCollectionData(docRef.colPath)[docRef.id];
  return {
    id: docRef.id,
    exists: () => data !== undefined,
    data: () => data || {},
  };
};

export const deleteDoc = async (docRef: any) => {
  const col = getCollectionData(docRef.colPath);
  if (!(docRef.id in col)) return;
  delete col[docRef.id];
  saveCollectionData(docRef.colPath, col);
};

export const addDoc = async (colRef: any, data: any) => {
  const id = 'doc_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
  const dRef = doc(null, colRef.path, id);
  await setDoc(dRef, { id, ...data });
  return dRef;
};

export const writeBatch = (_db?: any) => {
  const ops: Array<() => Promise<void>> = [];
  return {
    set: (docRef: any, data: any, options?: { merge?: boolean }) => {
      ops.push(() => setDoc(docRef, data, options));
    },
    update: (docRef: any, data: any) => {
      ops.push(() => updateDoc(docRef, data));
    },
    delete: (docRef: any) => {
      ops.push(() => deleteDoc(docRef));
    },
    commit: async () => {
      for (const op of ops) await op();
    },
  };
};

export const getDocs = async (queryRef: any) => {
  const col = getCollectionData(queryRef.colPath || queryRef.path);
  let docs = Object.entries(col).map(([id, data]) => ({
    id,
    data: () => data,
    exists: () => true,
  }));
  if (queryRef.filters && queryRef.filters.length > 0) {
    docs = docs.filter((d) => {
      const data = d.data();
      return queryRef.filters.every((f: any) => {
        if (f.op === '==') return data[f.field] === f.val;
        if (f.op === 'in') return Array.isArray(f.val) && f.val.includes(data[f.field]);
        if (f.op === 'array-contains') return Array.isArray(data[f.field]) && data[f.field].includes(f.val);
        return true;
      });
    });
  }
  if (queryRef.orderField) {
    docs.sort((a, b) => {
      const va = a.data()[queryRef.orderField];
      const vb = b.data()[queryRef.orderField];
      if (va < vb) return queryRef.orderDir === 'desc' ? 1 : -1;
      if (va > vb) return queryRef.orderDir === 'desc' ? -1 : 1;
      return 0;
    });
  }
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (cb: (d: any) => void) => docs.forEach(cb),
  };
};

export const query = (colRef: any, ...queryConstraints: any[]) => {
  const q: any = {
    colPath: colRef.path,
    filters: [],
  };
  queryConstraints.forEach((c) => {
    if (c.type === 'where') q.filters.push(c);
    if (c.type === 'orderBy') {
      q.orderField = c.field;
      q.orderDir = c.dir;
    }
  });
  return q;
};

export const where = (field: string, op: string, val: any) => ({
  type: 'where',
  field,
  op,
  val,
});

export const orderBy = (field: string, dir = 'asc') => ({
  type: 'orderBy',
  field,
  dir,
});

export const onSnapshot = (queryOrDoc: any, callback: (snap: any) => void, _onError?: (err: any) => void) => {
  const colPath = queryOrDoc.colPath || queryOrDoc.path;
  if (!listeners.has(colPath)) listeners.set(colPath, new Set());
  const emit = () => {
    if (queryOrDoc._isDoc) getDoc(queryOrDoc).then(callback);
    else getDocs(queryOrDoc).then(callback);
  };
  listeners.get(colPath)!.add(emit);
  setTimeout(emit, 10);
  return () => {
    listeners.get(colPath)?.delete(emit);
  };
};

export const runTransaction = async (_db: any, updateFunction: (tx: any) => Promise<any>) => {
  return updateFunction({
    get: async (docRef: any) => getDoc(docRef),
    set: (docRef: any, data: any, options?: { merge?: boolean }) => setDoc(docRef, data, options),
    update: (docRef: any, data: any) => updateDoc(docRef, data),
    delete: (docRef: any) => deleteDoc(docRef),
  });
};
