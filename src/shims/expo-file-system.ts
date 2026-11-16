export const EncodingType = {
  UTF8: 'utf8',
  Base64: 'base64',
} as const;

export class File {
  exists: boolean;
  size: number;
  uri: string;

  constructor(uri: string) {
    this.exists = true;
    this.size = 1024;
    this.uri = uri;
  }

  delete(): void {
    this.exists = false;
  }

  create(_options?: any): void {
    this.exists = true;
  }

  write(_content: any, _options?: any): void {}

  async copy(targetFile: File, _options?: any): Promise<void> {
    targetFile.exists = true;
  }
}

export class Directory {
  exists: boolean;
  uri: string;

  constructor(uri: string) {
    this.exists = true;
    this.uri = uri;
  }

  list(): Array<File | Directory> {
    return [];
  }

  delete(): void {
    this.exists = false;
  }
}

export const Paths = {
  cache: new Directory('cache://'),
  document: new Directory('document://'),
};

export const documentDirectory = 'document://';
export const cacheDirectory = 'cache://';

export const getInfoAsync = async (uri: string) => ({
  exists: Boolean(uri),
  isDirectory: false,
  size: 1024,
  uri,
});

export const readAsStringAsync = async (_uri: string, _options?: any) => '';
export const writeAsStringAsync = async (_uri: string, _content: string, _options?: any) => {};
export const deleteAsync = async (_uri: string, _options?: any) => {};
export const copyAsync = async (_options: any) => {};
export const downloadAsync = async (uri: string, fileUri: string, _options?: any) => ({
  uri: fileUri || uri,
  status: 200,
  headers: {},
  md5: '',
});

export default {
  EncodingType,
  File,
  Directory,
  Paths,
  documentDirectory,
  cacheDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
  deleteAsync,
  copyAsync,
  downloadAsync,
};
