const visit = require("unist-util-visit");
const htmlentities = require("he");
const toHTML = require("hast-util-to-html");
const prettier = require("prettier");

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

    function cleanBlockHTML(html) {
        html = html
            .replace("</pre>", "")
            .replace(/\<pre.*>/, "")
            .replace(/\<p\>\<\/p\>/g, "\n\n");

        while (html.match(/\<(.+\w+)="\{(.*)\}"(.*)\>/)) {
            html = html.replace(/\<(.+\w+)="\{(.*)\}"(.*)\>/, "<$1={$2}$3>");
        }

        html = html.replace(/&#39;/g, '"').replace(/&#34;/g, '"');
        html = prettier.format(html);

        return html;
    }

    // fix props with prop={{ ... }} notation
    // parsed into a mess of attributes style='{{', 'border:'='' ... '}}': ''
    function fixJsxObjectProps(tree) {
        if (tree.type === "element" && tree.properties) {
            // bad props start with a broken prop='{{'
            if (Object.values(tree.properties).some((val) => val === "{{")) {
                let props = [];
                let collecting = false;
                let prop, propVal;

                for (let [key, val] of Object.entries(tree.properties)) {
                    if (val === "{{") {
                        // the next several props are part of the object
                        collecting = true;
                        prop = key;
                        propVal = [val];
                    } else if (collecting) {
                        // collect props
                        propVal.push(`${key} ${val}`);

                        if (key.includes("}}") || val.includes("}}")) {
                            // stop collecting when done
                            props.push([
                                prop,
                                propVal
                                    .join(" ")
                                    .replace(/[ ]{2,}/g, " ")
                                    .trim(),
                            ]);
                            collecting = false;
                        }
                    } else {
                        props.push([key, val]);
                    }
                }

                tree.properties = Object.fromEntries(props);
            }
        }

        if (tree.children) {
            tree.children = tree.children.map(fixJsxObjectProps);
        }

        return tree;
    }

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
                            value: cleanBlockHTML(
                                toHTML(fixJsxObjectProps(block), settings)
                            ),
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

    function fixIframeLink(src) {
        if (src.match(/(youtube\.com|youtu\.be)\/embed\//)) {
            return src.replace("/embed/", "/watch?v=");
        } else if (src.match(/codesandbox/)) {
            return src.replace("/embed/", "/s/");
        }
        return src;
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
                        value: fixIframeLink(iframe.properties.src),
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
                        value: blockquote.properties.dataInstgrmPermalink.split(
                            "?"
                        )[0],
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
