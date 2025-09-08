// circular-js-hql/b.js — JS↔HQL circular
import { base } from './a.hql';

export function incByBase(x) {
  return x + base;
}

