const visit = require("unist-util-visit");
const util = require("util");
const htmlentities = require("he");
const toHTML = require("hast-util-to-html");

// function cleanupPost(postData) {
//     return postData.replace(/\n\n/g, "</p>").replace(/import/g, "\\import");
// }

// this is a remark plugin
function articleCleanup() {
    return (markdownAST) => {
        // visit(markdownAST, "pre", (node) => {
        //     console.log(node);
        //     return node;
        // });

        visit(markdownAST, "text", (node, index, parent) => {
            node.value = htmlentities.decode(node.value);
            node.value = node.value.replace(/https\:/, "https:");
            node.value = node.value.replace(/http\:/, "http:");

            if (
                node.value &&
                node.value.startsWith("http") &&
                parent.type !== "link"
            ) {
                node.type = "text";
                node.title = null;
            }

            return node;
        });
    };
}

// this is a remark plugin
function codeBlockDebugger() {
    return (markdownAST) => {
        console.log(require("util").inspect(markdownAST, false, null, true));
    };
}

// this is a rehype plugin
function fixCodeBlocks() {
    function findCodeBlocks(node) {
        let nodes = [];

        if (node.tagName === "pre") {
            nodes.push(node);
        } else if (node.children) {
            for (let child of node.children) {
                nodes.push(...findCodeBlocks(child));
            }
        }

        return nodes;
    }

    const settings = {
        quoteSmart: false,
        closeSelfClosing: false,
        omitOptionalTags: false,
        entities: { useShortestReferences: true },
    };

    return (tree) => {
        const codeBlocks = findCodeBlocks(tree);

        for (let block of codeBlocks) {
            const position = {
                start: block.children[0].position.start,
                end: block.children[block.children.length - 1].position.end,
            };

            block.children = [
                {
                    type: "element",
                    tagName: "code",
                    properties: {
                        className: [
                            `language-${
                                block.properties && block.properties.lang
                            }`,
                        ],
                    },
                    children: [
                        {
                            type: "text",
                            value: toHTML(block, settings)
                                .replace("</pre>", "")
                                .replace(/\<pre.*>/, "")
                                .replace(/\<p\>\<\/p\>/g, "\n\n"),
                            position,
                        },
                    ],
                    position,
                },
            ];
        }

        // console.log(codeBlocks.length);
        // console.log("-----------");
        // console.log(require("util").inspect(tree, false, null, true));
        // console.log("----------");

        return tree;
        // visit(markdownAST, "code", (node, index, parent) => {
        //     console.log(node);

        //     return node;
        // });
    };
}

module.exports = { articleCleanup, fixCodeBlocks, codeBlockDebugger };
