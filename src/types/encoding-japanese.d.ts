declare module "encoding-japanese" {
  type Data = string | number[] | Uint8Array;
  interface Encoding {
    convert(data: Data, opts: { to: string; from?: string; type?: string }): number[];
    stringToCode(s: string): number[];
    codeToString(code: number[]): string;
    toHankakuCase(s: string): string;
    toHankanaCase(s: string): string;
    toZenkakuCase(s: string): string;
    toZenkanaCase(s: string): string;
    detect(data: Data): string | false;
  }
  const Encoding: Encoding;
  export default Encoding;
}
