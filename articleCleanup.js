const visit = require("unist-util-visit");
const util = require("util");
const htmlentities = require("he");

// function cleanupPost(postData) {
//     return postData.replace(/\n\n/g, "</p>").replace(/import/g, "\\import");
// }

function articleCleanup() {
    return (markdownAST) => {
        // console.log("-------------");
        // console.log(
        //     util.inspect(markdownAST, { showHidden: false, depth: null })
        // );

        visit(markdownAST, "text", (node, index, parent) => {
            node.value = htmlentities.decode(node.value);
            node.value = node.value.replace(/https\:/, "https:");
            node.value = node.value.replace(/http\:/, "http:");

            if (
                node.value &&
                node.value.startsWith("http") &&
                parent.type !== "link"
            ) {
                node.type = "link";
                node.title = null;
                node.url = node.value;
                node.children = [
                    {
                        type: "text",
                        value: node.value,
                    },
                ];
                // node.url = node.value;
                // node.title = null;
                // node.children = [
                //     {
                //         type: "text",
                //         value: node.url,
                //     },
                // ];
            }

            return node;
        });
    };
}

module.exports = articleCleanup;
