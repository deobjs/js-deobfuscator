# JS Obfuscated Code Restoration

Let obfuscation no longer be a stumbling block in reverse engineering.

## Usage

### Webpage

[js-deobfuscator.vercel.app](https://js-deobfuscator.vercel.app/) Online Experience

![image-1](./images/1.png)

Before performing the restoration, please configure according to your actual code.

### Local Installation

```sh
git clone https://github.com/kuizuo/js-deobfuscator
cd js-deobfuscator
pnpm i
```

The example directory contains some examples of obfuscated code I've encountered and configuration options. The structure of each subdirectory is as follows:

```text
├── xxx # Subdirectory
│ ├── index.ts # Run the code
│ ├── input.js # Obfuscated code
│ ├── output.js # Restored code
│ ├── pretty.js # Used for beautification and comparison
│ ├── setupCode.js # Inject execution code
│ ├── errorCode.js # Outputs error codes to this file when code replacement causes syntax errors
```

## Usage Documentation

There are several key pieces of code for obfuscation and restoration:

**String array**: A very long string array, usually storing all the encrypted strings

**Scrambling function**: Usually a self-invoking function that takes a string array as an argument and scrambles the string array.

**Decryptor**: Restores the original text by calling the decryptor (function).

This project provides three methods for locating the decryptor: string array length, decryptor call count, and code injection analysis. The location of the decryptor is based on the actual obfuscated code.

## Acknowledgements

- [Anti-Crawler AST Principles and Practical Reconstruction of Obfuscation](https://book.douban.com/subject/35575838/)

- [j4k0xb/webcrack](https://github.com/j4k0xb/webcrack)

- [sxzz/ast-explorer](https://github.com/sxzz/ast-explorer)
