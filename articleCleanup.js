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
        visit(markdownAST, "code", (node) => {
            console.log(require("util").inspect(node, false, null, true));
        });
    };
}

function findRehypeNodes(node, tagName) {
    let nodes = [];

    if (node.tagName === tagName) {
        nodes.push(node);
    } else if (node.children) {
        for (let child of node.children) {
            nodes.push(...findRehypeNodes(child, tagName));
        }
    }

    return nodes;
}

// this is a rehype plugin
function fixCodeBlocks() {
    const settings = {
        quoteSmart: false,
        closeSelfClosing: false,
        omitOptionalTags: false,
        entities: { useShortestReferences: true },
    };

    return (tree) => {
        const codeBlocks = findRehypeNodes(tree, "pre");

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

// this is a rehype plugin
// changes iframe and blockquote embeds to regular links
function fixEmbeds() {
    function isEmbeddable(iframe) {
        return iframe.properties.src.match(
            /^http(s)?:\/\/(www\.)?(youtube|youtu.be|codesandbox|codepen)/
        );
    }

    function isTweet(blockquote) {
        return (
            blockquote.properties &&
            blockquote.properties.className &&
            blockquote.properties.className.includes("twitter-tweet")
        );
    }

    function isInstagram(blockquote) {
        return (
            blockquote.properties &&
            blockquote.properties.className &&
            blockquote.properties.className.includes("instagram-media")
        );
    }

    function isCodepen(paragraph) {
        return (
            paragraph.properties &&
            paragraph.properties.className &&
            paragraph.properties.className.includes("codepen")
        );
    }

    return (tree) => {
        const iframes = findRehypeNodes(tree, "iframe");
        const blockquotes = findRehypeNodes(tree, "blockquote");
        const paragraphs = findRehypeNodes(tree, "p");

        for (let iframe of iframes) {
            if (isEmbeddable(iframe)) {
                iframe.type = "element";
                iframe.tagName = "p";
                iframe.children = [
                    {
                        type: "text",
                        value: iframe.properties.src,
                    },
                ];
            }
        }

        for (let blockquote of blockquotes) {
            if (isTweet(blockquote)) {
                const link = findRehypeNodes(blockquote, "a").pop();
                blockquote.type = "element";
                blockquote.tagName = "p";
                blockquote.children = [
                    { type: "text", value: link.properties.href },
                ];
            } else if (isInstagram(blockquote)) {
                blockquote.type = "element";
                blockquote.tagName = "p";
                blockquote.children = [
                    {
                        type: "text",
                        value: blockquote.properties.dataInstgrmPermalink,
                    },
                ];
            }
        }

        for (let paragraph of paragraphs) {
            if (isCodepen(paragraph)) {
                const link = findRehypeNodes(paragraph, "a").shift();
                paragraph.children = [
                    {
                        type: "text",
                        value: link.properties.href,
                    },
                ];
            }
        }

        return tree;
    };
}

module.exports = {
    articleCleanup,
    fixCodeBlocks,
    codeBlockDebugger,
    fixEmbeds,
};
