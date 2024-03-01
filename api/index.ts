import express, { Request, Response } from 'express';
import mysql from 'mysql';
import bcrypt from 'bcrypt';

const app = express();

// Create a MySQL connection pool
const db = mysql.createPool({
    host: '202.28.34.197',
    user: 'web66_65011212003',
    password: '65011212003@csmsu',
    database: 'web66_65011212003',
});

// Middleware to parse JSON in the request body
app.use(express.json());

// Endpoint to get all users
app.get('/users', (req: Request, res: Response) => {
    const query = 'SELECT * FROM Users';

    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        res.json(results);
    });
});

// Endpoint to get a specific user by ID
app.get('/users/:id', (req: Request, res: Response) => {
    const userId = req.params.id;
    const query = 'SELECT * FROM Users WHERE UserID = ?';

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(results[0]);
    });
});

app.post('/register', async (req: Request, res: Response) => {
    const { username, password, avatarURL } = req.body;

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the user into the database
    const query = 'INSERT INTO Users (Username, Password, AvatarURL) VALUES (?, ?, ?)';

    db.query(query, [username, hashedPassword, avatarURL], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        res.json({ userId: results.insertId, message: 'User created successfully' });
    });
});



// Endpoint for user login
app.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;

    // Check if username and password are provided
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if the user exists in the database
    const query = 'SELECT * FROM Users WHERE Username = ?';

    db.query(query, [username], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Compare the provided password with the hashed password from the database
        const user = results[0];
        bcrypt.compare(password, user.Password, (bcryptErr, bcryptResult) => {
            if (bcryptErr) {
                console.error(bcryptErr);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            if (!bcryptResult) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            // Passwords match, user is authenticated
            res.json({ userId: user.UserID, message: 'Login successful' });
        });
    });
});

app.get('/randomImages', (req: Request, res: Response) => {
    const query = 'SELECT * FROM Images ORDER BY RAND() LIMIT 2';

    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        res.json(results);
    });
});


interface Image {
    ImageID: number;
    EloScore: number;
    // Add other properties as needed
}


// Endpoint to record a vote with Elo rating update
app.post('/vote', (req: Request, res: Response) => {
    const { voterID, winImageID, loseImageID } = req.body;

    // Check if all required parameters are provided
    if (!voterID || !winImageID || !loseImageID) {
        return res.status(400).json({ error: 'Voter ID, Win Image ID, and Lose Image ID are required' });
    }

    // Check if the voter exists
    const userQuery = 'SELECT * FROM Users WHERE UserID = ?';

    db.query(userQuery, [voterID], (userErr, userResults) => {
        if (userErr) {
            console.error(userErr);
            return res.status(500).json({ error: 'Internal Server Error user' });
        }

        if (userResults.length === 0) {
            return res.status(404).json({ error: 'Voter not found' });
        }

        // Check if the win image and lose image exist
        const imageQuery = 'SELECT * FROM Images WHERE ImageID IN (?, ?)';

        db.query(imageQuery, [winImageID, loseImageID], (imageErr, imageResults) => {
            if (imageErr) {
                console.error(imageErr);
                return res.status(500).json({ error: 'Internal Server Error images' });
            }

            if (imageResults.length < 2) {
                return res.status(404).json({ error: 'One or more images not found' });
            }

            const winImage: Image | undefined = imageResults.find((image: Image) => image.ImageID === winImageID);
            const loseImage: Image | undefined = imageResults.find((image: Image) => image.ImageID === loseImageID);

            // Check if winImage and loseImage are defined
            if (!winImage || !loseImage) {
                return res.status(404).json({ error: 'One or more images not found' });
            }

            // Update Elo scores using the Elo rating algorithm
            const eloK = 32; // Adjust this value based on your preferences
            const expectedWinProbability = 1 / (1 + 10 ** ((loseImage.EloScore - winImage.EloScore) / 400));

            winImage.EloScore += eloK * (1 - expectedWinProbability);
            loseImage.EloScore += eloK * (0 - (1 - expectedWinProbability));

            // Update Elo scores in the database
            const updateQuery = 'UPDATE Images SET EloScore = ? WHERE ImageID = ?';

            db.query(updateQuery, [winImage.EloScore, winImageID], (updateErr1) => {
                if (updateErr1) {
                    console.error(updateErr1);
                    return res.status(500).json({ error: `Internal Server Error update ELOSCORE WIN: ${updateErr1.message}` });
                }

                db.query(updateQuery, [loseImage.EloScore, loseImageID], (updateErr2) => {
                    if (updateErr2) {
                        console.error(updateErr2);
                        return res.status(500).json({ error: `Internal Server Error update ELOSCORE LOSE: ${updateErr2.message}` });
                    }

                    // Insert the vote into the database
                    const voteQuery = 'INSERT INTO Votes (VoterID, WinImageID, LoseImageID) VALUES (?, ?, ?)';

                    db.query(voteQuery, [voterID, winImageID, loseImageID], (voteErr) => {
                        if (voteErr) {
                            console.error(voteErr);
                            return res.status(500).json({ error: `Internal Server Error insert Votes: ${voteErr.message}` });
                        }

                        res.json({ message: 'Vote recorded successfully' });
                    });
                });
            });
        });
    });
});



// Update user information endpoint
app.put('/users/:id', (req, res) => {
    const userId = parseInt(req.params.id);
    const { Username, Password, AvatarURL } = req.body;

    // Check if the required fields are present
    if (!Username && !Password && !AvatarURL) {
        return res.status(400).json({ error: 'At least one field (Username, Password, AvatarURL) is required for update' });
    }

    // Construct the SQL query to update the user
    let updateQuery = 'UPDATE Users SET ';
    const values = [];

    if (Username) {
        updateQuery += 'Username=?, ';
        values.push(Username);
    }

    if (Password) {
        updateQuery += 'Password=?, ';
        values.push(Password);
    }

    if (AvatarURL) {
        updateQuery += 'AvatarURL=?, ';
        values.push(AvatarURL);
    }

    // Remove the trailing comma and complete the query
    updateQuery = updateQuery.slice(0, -2);
    updateQuery += ' WHERE UserID=?';
    values.push(userId);

    // Execute the update query
    db.query(updateQuery, values, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'User updated successfully' });
    });
});


app.delete('/users/:id', (req, res) => {
    const userId = parseInt(req.params.id);

    // Construct the SQL query to delete the user
    const deleteQuery = 'DELETE FROM Users WHERE UserID=?';

    // Execute the delete query
    db.query(deleteQuery, [userId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'User deleted successfully' });
    });
});


app.get('/top-rated', (req, res) => {
    // Construct the SQL query to get the top 10 rated users
    const topRatedQuery = 'SELECT * FROM Images ORDER BY EloScore DESC LIMIT 10';

    // Execute the query
    db.query(topRatedQuery, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        res.json(results);
    });
});

app.put('/change-image/:userId', async (req: Request, res: Response) => {
    const userId = req.params.userId;
    const { newImageUrl } = req.body;

    if (!newImageUrl) {
        return res.status(400).json({ error: 'New image URL is required' });
    }

    try {
        // Update the image URL in the database
        const updateQuery = 'UPDATE Images SET ImageURL = ? WHERE UserID = ?';
        db.query(updateQuery, [newImageUrl, userId], (error, results) => {
            if (error) {
                throw error;
            }

            // Check if any rows were affected (image updated successfully)
            if (results.affectedRows > 0) {
                res.json({ message: 'Image updated successfully' });
            } else {
                res.status(404).json({ error: 'User not found or image update failed' });
            }
        });
    } catch (error) {
        console.error('Error updating image:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


app.get('/view-image', (req: Request, res: Response) => {
    // Assuming you have user authentication in place, and you get the user ID from the authenticated user.
    const userId = req.query.userId; // Replace with your actual method to get the user ID.

    // Get the user's image list
    const getUserImagesQuery = `SELECT * FROM Images WHERE UserID = ? ORDER BY EloScore DESC`;
    db.query(getUserImagesQuery, [userId], (getUserImagesErr, userImages) => {
        if (getUserImagesErr) {
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        // Get the user's daily statistics
        const getDailyStatsQuery = `SELECT * FROM DailyStatistics WHERE UserID = ? ORDER BY Date DESC LIMIT 2`;
        db.query(getDailyStatsQuery, [userId], (getDailyStatsErr, dailyStats) => {
            if (getDailyStatsErr) {
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            // Calculate ranking changes
            const todayWins = dailyStats[0]?.Wins || 0;
            const yesterdayWins = dailyStats[1]?.Wins || 0;
            const rankingChange = todayWins - yesterdayWins;

            // Send the response with user images and ranking changes
            res.json({ userImages, rankingChange });
        });
    });
});



// Start the server
app.listen(3000, () => console.log('Server ready on port 3000.'));

export default app;
