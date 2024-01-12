import { JSONArray, JSONObject, JSONPrimitive } from "./json-types";
import "reflect-metadata";

export type Permission = "r" | "w" | "rw" | "none";

export type StoreResult = Store | JSONPrimitive | undefined;

enum EPolicy {
  read = "r",
  write = "w",
  readAndWrite = "rw",
  none = "none"
}

export type StoreValue =
  | JSONObject
  | JSONArray
  | StoreResult
  | (() => StoreResult);

export interface IStore {
  defaultPolicy: Permission;
  allowedToRead(key: string): boolean;
  allowedToWrite(key: string): boolean;
  read(path: string): StoreResult;
  write(path: string, value: StoreValue): StoreValue;
  writeEntries(entries: JSONObject): void;
  entries(): JSONObject;
}

const restrictMetadataKey = Symbol("Restrict");

export function Restrict(...params: unknown[]):any {
  return Reflect.metadata(restrictMetadataKey, params);
}

export class Store implements IStore {
  defaultPolicy: Permission = "rw";
  [key: string]: any;

  allowedToRead(key: string): boolean {
    const restriction = getRestriction(this, key);
    if (restriction) return restriction.toString().includes(EPolicy.read);
    return this.defaultPolicy.toString().includes(EPolicy.read);
  }

  allowedToWrite(key: string): boolean {
    const restriction = getRestriction(this, key);
    if (restriction) return restriction.toString().includes(EPolicy.write);
    return this.defaultPolicy.toString().includes(EPolicy.write);
  }

  read(path: string): StoreResult {
    if (this.allowedToRead(path)) return getValue(this, path);
    throw new Error(`Cannot read path ${path}`);
  }

  write(path: string, value: StoreValue): StoreValue {
    if (this.allowedToWrite(path)) {
      const keys = path.split(":");
      if (keys.length === 1) {
        this[path] = value;
        return;
      }

      const key = keys.shift();
      this[key as keyof typeof String] = assign(keys, value);;
      return;
    }
    throw new Error(`Cannot write path ${path}`);
  }

  writeEntries(entries: JSONObject): void {
    return Object.entries(entries).forEach(([key, value]) => this.write(key, value));
  }

  entries(): JSONObject {
    return Object.entries(this).reduce<JSONObject>((acc, [key, value]) => {
      if (key === "defaultPolicy" || !this.allowedToRead(key)) return acc;
      acc[key] = value;
      return acc;
    }, {});
  }
}

function getRestriction(target: Store, propertyKey: string): Permission {
  const [key,] = propertyKey.split(":");
  if (target.user && key === "user") return EPolicy.readAndWrite;
  return Reflect.getMetadata(restrictMetadataKey, target, key);
}

function assign(keyPath: string[], value: StoreValue) {
  const reducer = (acc: any, item: string, index: number, arr: Array<string>) => ({ [item]: index + 1 < arr.length ? acc : value });
  return keyPath.reduceRight(reducer, {});
}

function getValue(store: Store, path: string): StoreResult {
  const [key, subkey,] =  path.split(":");
    if (typeof store[key] === typeof Function) {
      if (store.constructor.name === "AdminStore") return store[key]()[subkey];
      return store;
    }
  if (!path) return store;
  const properties = path.split(':');
  if (store) return getValue(store[properties.shift() as keyof typeof String], properties.join(':'));
}



