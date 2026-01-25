import generate from "@babel/generator";
import traverse from "@babel/traverse";
// eslint-disable-next-line ts/ban-ts-comment
import * as t from "@babel/types";

import type { Objects } from "./save-objects";

import { type Transform, getPropName } from "../ast-utils";

/**
 * To replace object properties, you need to first execute `saveAllObject` to save all variables.
 * @example
 * var r = {
 *   "PzXHf": "0|2|4|3|1",
 *   "LeQrV": function (n, t) {
 *     return n(t);
 *   }
 * }
 *
 * var u = r["PzXHf"]["split"]("|");
 * r["LeQrV"](_0x3028, "foo");
 * ⬇️
 * var u = "0|2|4|3|1"["split"]("|");
 * _0x3028("foo")
 */
export default {
  name: "Object property reference replacement",
  run(ast, state, objects) {
    if (!objects) return;

    const usedMap = new Map();
    const usedObjects: Record<any, any> = {};

    /**
     * Literal quantification command restoration
     * r["PzXHf"] ---> "0|2|4|3|1"
     */
    traverse(ast, {
      MemberExpression(path) {
        // The parent expression cannot be an assignment statement.
        const asignment = path.parentPath;
        if (!asignment || asignment?.type === "AssignmentExpression") return;

        const { object, property } = path.node;
        if (
          object.type === "Identifier" &&
          (property.type === "StringLiteral" || property.type === "Identifier")
        ) {
          const objectName = object.name;

          // Find the definition location of objectName
          const binding = path.scope.getBinding(objectName);
          if (!binding) return;

          const start = binding.identifier.start;

          const propertyName = getPropName(property);

          if (objects[`${start}_${objectName}`]) {
            const objectInit = objects[`${start}_${objectName}`];

            const properties = objectInit.properties;
            for (const prop of properties) {
              if (prop.type === "ObjectProperty") {
                const keyName = getPropName(prop.key);
                if (
                  (prop.key.type === "StringLiteral" ||
                    prop.key.type === "Identifier") &&
                  keyName === propertyName &&
                  t.isLiteral(prop.value)
                ) {
                  // It is also necessary to check whether objectName[propertyName] has been modified.
                  const binding = path.scope.getBinding(objectName);
                  if (
                    binding &&
                    binding.constant &&
                    binding.constantViolations.length === 0
                  ) {
                    // Some special codes are not processed, such as _0x52627b["QqaUY"]++
                    if (path.parent.type === "UpdateExpression") return;

                    usedMap.set(
                      `${objectName}.${propertyName}`,
                      generate(prop.value),
                    );

                    usedObjects[objectName] =
                      usedObjects[objectName] || new Set();
                    usedObjects[objectName].add(propertyName);

                    path.replaceWith(prop.value);
                  }
                }
              }
            }
          }
        }
      },
    });

    /**
     * Function junk instruction restoration
     * r["LeQrV"](_0x3028, "foo");  --->  _0x3028("foo");
     */
    traverse(ast, {
      CallExpression(path) {
        const { callee } = path.node;
        if (
          callee.type === "MemberExpression" &&
          callee.object.type === "Identifier"
        ) {
          const objectName = callee.object.name;
          const propertyName = getPropName(callee.property);

          // Find the definition location of objectName
          const binding = path.scope.getBinding(objectName);
          if (!binding) return;

          const start = binding.identifier.start;

          if (objects[`${start}_${objectName}`]) {
            const objectInit = objects[`${start}_${objectName}`];

            const properties = objectInit.properties;

            // Actual transmitted parameters
            const argumentList = path.node.arguments;

            for (const prop of properties) {
              if (prop.type !== "ObjectProperty") continue;

              const keyName = getPropName(prop.key);

              if (
                (prop.key.type === "StringLiteral" ||
                  prop.key.type === "Identifier") &&
                prop.value.type === "FunctionExpression" &&
                keyName === propertyName
              ) {
                // Get the defined function
                const orgFn = prop.value;

                // In the original code, the function body consists of only one line of return statement; the argument attribute is extracted and replaced with the calling node.
                const firstStatement = orgFn.body.body?.[0];
                if (firstStatement?.type !== "ReturnStatement") return;

                // Return parameters
                const returnArgument = firstStatement.argument;

                let isReplace = false;
                if (t.isBinaryExpression(returnArgument)) {
                  // _0x5a2810 + _0x2b32f4
                  const binaryExpression = t.binaryExpression(
                    returnArgument.operator,
                    // @ts-expect-error
                    argumentList[0],
                    argumentList[1],
                  );
                  path.replaceWith(binaryExpression);
                  isReplace = true;
                } else if (t.isLogicalExpression(returnArgument)) {
                  // _0x5a2810 || _0x2b32f4
                  const logicalExpression = t.logicalExpression(
                    returnArgument.operator,
                    // @ts-expect-error
                    argumentList[0],
                    argumentList[1],
                  );
                  path.replaceWith(logicalExpression);
                  isReplace = true;
                } else if (t.isUnaryExpression(returnArgument)) {
                  // !_0x5a2810
                  const unaryExpression = t.unaryExpression(
                    returnArgument.operator,
                    // @ts-expect-error
                    argumentList[0],
                  );
                  path.replaceWith(unaryExpression);
                  isReplace = true;
                } else if (t.isCallExpression(returnArgument)) {
                  // function (_0x1d0a4d, _0x1df411) {
                  //   return _0x1d0a4d();
                  // }

                  // Retrieve which parameter is used as the function name for calling the function, because multiple parameters may be passed; select one or more of them.
                  // Ensure that the called function name is an identifier before replacing it.
                  if (returnArgument.callee.type !== "Identifier") return;

                  const callFnName = returnArgument.callee.name; // Function name of formal parameters

                  // Find the index from the multiple passed parameters
                  const callIndex = orgFn.params.findIndex(
                    // @ts-expect-error
                    (a) => a.name === callFnName,
                  );

                  // Then find the actual function name from the actual parameters (arguments).
                  const realFnName = argumentList.splice(callIndex, 1)[0];
                  const callExpression = t.callExpression(
                    // @ts-expect-error
                    realFnName,
                    argumentList,
                  );
                  path.replaceWith(callExpression);
                  isReplace = true;
                }

                if (isReplace) {
                  usedMap.set(`${objectName}.${propertyName}`, generate(orgFn));

                  usedObjects[objectName] =
                    usedObjects[objectName] || new Set();
                  usedObjects[objectName].add(propertyName);
                }
              }
            }
          }
        }
      },
    });

    const removeSet = new Set();

    /**
     * 移除已使用过的 property(key)
     * var _0x52627b = {
     *  'QqaUY': "attribute",
     *  SDgrw: "123"
     * }
     * _0x52627b["QqaUY"]
     * 🔽
     * var _0x52627b = {
     *  SDgrw: "123"
     * }
     * "attribute"
     */
    if (Object.keys(usedObjects).length > 0) {
      traverse(ast, {
        ObjectProperty(path) {
          let objectName = "";

          const parentPath = path.parentPath.parentPath;

          if (!parentPath) return;

          if (parentPath?.isAssignmentExpression())
            objectName = (parentPath.node.left as t.Identifier).name;
          else if (parentPath.isVariableDeclarator())
            objectName = (parentPath.node.id as t.Identifier).name;

          if (!objectName) return;

          const propertyName = getPropName(path.node.key);

          if (usedObjects[objectName]?.has(propertyName)) {
            path.remove();
            removeSet.add(`${objectName}.${propertyName}`);
          }
        },
      });
    }

    if (usedMap.size > 0) console.log(`已被替换对象: `, usedMap);

    if (removeSet.size > 0) console.log(`已移除key列表:`, removeSet);
  },
  // @ts-expect-error
} satisfies Transform<Objects>;
