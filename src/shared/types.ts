/** Structural mirror of a browser bookmark tree node. Core code depends on this, never on the browser's own type. */
export interface BookmarkNode {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  /** Absent on folders. */
  url?: string;
  dateAdded?: number;
  children?: BookmarkNode[];
}

export interface BookmarkRecord {
  id: string;
  parentId: string;
  /** Enclosing folder names, outermost first. Excludes the invisible root. */
  path: string[];
  index: number;
  title: string;
  url: string;
  normalizedUrl: string;
  dateAdded: number;
  scannable: boolean;
}

export interface FolderRecord {
  id: string;
  parentId: string;
  /** Enclosing folder names, outermost first. Excludes this folder itself. */
  path: string[];
  title: string;
  /** 1 for the built-in top-level folders, 2 for their children, and so on. */
  depth: number;
  /** Built-in folders that must never be offered for deletion. */
  isProtected: boolean;
}
