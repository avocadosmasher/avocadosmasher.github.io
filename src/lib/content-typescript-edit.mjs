import ts from 'typescript';
import { OperationContractError } from './content-operation-contract.mjs';

export function assertNoRegistryReferences(source, declaration, name) {
  const visit = node => {
    if (ts.isIdentifier(node) && node.text === name && node !== declaration.name) {
      const parent = node.parent;
      const propertyName = parent && (ts.isPropertyAssignment(parent) || ts.isPropertyAccessExpression(parent)) && parent.name === node;
      if (!propertyName) throw new OperationContractError('patch.unsupported', name, `선언 밖 ${name} 참조의 영향을 추측해 편집하지 않습니다.`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// 객체 속성과 배열 항목을 같은 규칙으로 추가함. 기존 원문의 위치는 바꾸지 않음.
export function staticMemberEdits(text, source, collection, members, entries) {
  if (!entries.length) return [];
  const closing = collection.end - 1;
  const lineStart = text.lastIndexOf('\n', closing - 1) + 1;
  const prefix = text.slice(lineStart, closing);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const edits = [];
  const last = members.at(-1);
  if (last && !members.hasTrailingComma) edits.push({ start: last.end, end: last.end, text: ',' });
  if (/^[ \t]*$/.test(prefix) && lineStart > collection.getStart(source)) {
    const first = members[0];
    const firstStart = first?.getStart(source);
    const firstPrefix = firstStart === undefined ? '' : text.slice(text.lastIndexOf('\n', firstStart - 1) + 1, firstStart);
    const indent = first && /^[ \t]+$/.test(firstPrefix) ? firstPrefix : prefix + '  ';
    edits.push({ start: lineStart, end: lineStart, text: entries.map(entry => indent + entry + ',' + newline).join('') });
  } else edits.push({ start: closing, end: closing,
    text: (/\s$/.test(text.slice(0, closing)) ? '' : ' ') + entries.join(', ') + ' ' });
  return edits;
}

export function applySourceEdits(text, edits) {
  let result = text;
  // 같은 위치에서는 항목을 먼저 넣고 구분 쉼표를 그 앞에 삽입함.
  for (const edit of [...edits].reverse().sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}
