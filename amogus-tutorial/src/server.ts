import * as amogus from "amogus-driver";
import * as api from "./api_output/ts/index";
import * as fs from "fs";

const userDb: {
    [id: number]: {
        id: number;
        email: string;
        name: string;
        password: string; // don't store passwords in plain text in production
    }
} = {};

// create a TLS listener (acceptor)
new amogus.transport.node.TlsListener<ReturnType<typeof api.$specSpace>>(api.$specSpace, {
    port: 1234,
    cert: fs.readFileSync(__dirname + "/certs/server.cert"),
    key: fs.readFileSync(__dirname + "/certs/server.key"),
    rejectUnauthorized: false
}, (client) => {
    console.log("client connected");
    // the second argument is the initial state
    // it will be passed down to the method handlers, they can also modify it
    const session = new amogus.Server(client, { userId: null });
    const boundApi = api.$bind(client);

    // sign_up() handler
    session.onInvocation("sign_up", async (method, _state) => {
        const params = method.params;
        console.log(`sign_up: email: "${params.email}", name: "${params.username}", password: "${params.password}"`);

        // find email/username duplicates
        if(Object.values(userDb).some(x => x.email === params.email)) {
            await method.error(boundApi.ErrorCode.email_in_use, "email already in use");
            return;
        } else if(Object.values(userDb).some(x => x.name === params.username)) {
            await method.error(boundApi.ErrorCode.username_taken, "username already taken");
            return;
        }

        // create the user
        const id = Math.floor(Math.random() * 100000); // don't do this in production
        userDb[id] = { id, email: params.email, name: params.username, password: params.password };
        console.log(`created user with id ${id}`);
        await method.return({ });
    });

    // log_in() handler
    session.onInvocation("log_in", async (method, _state) => {
        const params = method.params;
        console.log(`log_in: email: "${params.email}", password: "${params.password}"`);

        // find the user
        const user = Object.values(userDb).find(x => x.email === params.email);
        if(!user) {
            await method.error(boundApi.ErrorCode.invalid_email, "unknown email");
            return;
        }
        if(user.password !== params.password) {
            await method.error(boundApi.ErrorCode.invalid_password, "invalid password");
            return;
        }

        // logged in!
        await method.return({ user: user.id });
        return { userId: user.id }; // here we're modifying the state
    });

    session.onInvocation("User.get", async (method, state) => {
        const params = method.params;
        console.log(`user_get: user: ${params.id}`);

        // find the user
        const user = userDb[params.id];
        if(!user) {
            await method.error(boundApi.ErrorCode.invalid_id, "unknown entity");
            return;
        }

        // return the user
        await method.return({ entity: new boundApi.User(user) as amogus.ValuedEntity });

        // push a fake update after one second (showcase!)
        setTimeout(async () => {
            await client.pushEntity(new boundApi.User({
                id: state.userId,
                name: "Amogus"
            }) as amogus.ValuedEntity);
        }, 1000);
    });
});

console.log("Listening on port 1234");